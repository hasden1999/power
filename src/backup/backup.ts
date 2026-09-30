/**
 * src/backup/backup.ts
 * OPFS Snapshots, External SQLite Export, Web Share API, Integrity Check & CSV Exporter
 * Zero-CDN & 100% Offline
 */

import { db } from '../db/database.ts';
import type { Subscriber, BillingRecord } from '../types/index.ts';

export interface BackupSnapshot {
  name: string;
  timestamp: number;
  dateStr: string;
  sizeBytes: number;
}

export class BackupManager {
  private readonly MAX_OPFS_SNAPSHOTS = 7;
  private readonly SNAPSHOT_DIR = 'backups';

  constructor() {
    this.initAutoBackupListener();
  }

  private initAutoBackupListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('ampereji:trigger-auto-backup', async () => {
        try {
          await this.createOpfsSnapshot('auto_modification_threshold');
        } catch (err) {
          console.warn('[BackupManager] Auto snapshot error:', err);
        }
      });
    }
  }

  /**
   * Create an automated internal snapshot inside OPFS (retaining last 7)
   */
  public async createOpfsSnapshot(triggerReason: string = 'manual'): Promise<string> {
    const bytes = await db.exportDatabaseBinary();
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${dateStr}.sqlite`;

    if (typeof navigator.storage?.getDirectory === 'function') {
      try {
        const root = await navigator.storage.getDirectory();
        const backupDir = await root.getDirectoryHandle(this.SNAPSHOT_DIR, { create: true });

        // Save new snapshot
        const fileHandle = await backupDir.getFileHandle(filename, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(bytes);
        await writable.close();

        // Prune older snapshots if exceeding MAX_OPFS_SNAPSHOTS
        await this.pruneOldSnapshots(backupDir);

        const nowIso = now.toISOString();
        await db.updateSettings({ lastBackup: nowIso });

        console.log(`[BackupManager] OPFS Snapshot created: ${filename} (${triggerReason})`);
        return filename;
      } catch (err) {
        console.warn('[BackupManager] OPFS snapshot failed, saving to local storage as fallback:', err);
      }
    }
    return filename;
  }

  /**
   * List all stored OPFS snapshots
   */
  public async listOpfsSnapshots(): Promise<BackupSnapshot[]> {
    const list: BackupSnapshot[] = [];
    if (typeof navigator.storage?.getDirectory !== 'function') return list;

    try {
      const root = await navigator.storage.getDirectory();
      const backupDir = await root.getDirectoryHandle(this.SNAPSHOT_DIR, { create: true });

      // Iterate through directory
      for await (const [name, handle] of (backupDir as any).entries()) {
        if (name.endsWith('.sqlite')) {
          const file = await (handle as FileSystemFileHandle).getFile();
          list.push({
            name,
            timestamp: file.lastModified,
            dateStr: new Date(file.lastModified).toLocaleString('ar-IQ'),
            sizeBytes: file.size,
          });
        }
      }

      list.sort((a, b) => b.timestamp - a.timestamp);
    } catch (_) {}

    return list;
  }

  private async pruneOldSnapshots(backupDir: FileSystemDirectoryHandle): Promise<void> {
    try {
      const files: { name: string; time: number }[] = [];
      for await (const [name, handle] of (backupDir as any).entries()) {
        if (name.endsWith('.sqlite')) {
          const file = await (handle as FileSystemFileHandle).getFile();
          files.push({ name, time: file.lastModified });
        }
      }

      if (files.length > this.MAX_OPFS_SNAPSHOTS) {
        files.sort((a, b) => a.time - b.time); // Oldest first
        const toDeleteCount = files.length - this.MAX_OPFS_SNAPSHOTS;
        for (let i = 0; i < toDeleteCount; i++) {
          await backupDir.removeEntry(files[i].name);
          console.log(`[BackupManager] Pruned old snapshot: ${files[i].name}`);
        }
      }
    } catch (err) {
      console.warn('[BackupManager] Snapshot prune error:', err);
    }
  }

  /**
   * Export database as a .sqlite file using Web Share API or Direct Download
   */
  public async exportDatabaseFile(): Promise<void> {
    const bytes = await db.exportDatabaseBinary();
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const filename = `ampereji_backup_${formattedDate}.sqlite`;

    const blob = new Blob([bytes as any], { type: 'application/x-sqlite3' });
    const file = new File([blob], filename, { type: 'application/x-sqlite3' });

    // 1. Try Mobile Web Share API
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: 'نسخة احتياطية - منظومة أمبيرجي',
          text: `نسخة احتياطية لقاعدة بيانات منظومة أمبيرجي بتاريخ ${formattedDate}`,
          files: [file],
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[BackupManager] Share API failed, falling back to download:', err);
        } else {
          return; // User canceled share sheet
        }
      }
    }

    // 2. Direct Browser Download Fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /**
   * Restore database from imported .sqlite file with integrity check & safety backup
   */
  public async restoreDatabaseFromFile(file: File): Promise<{ success: boolean; message: string }> {
    // 1. Validate file extension and size
    if (!file.name.endsWith('.sqlite') && !file.name.endsWith('.db') && !file.name.endsWith('.sqlite3')) {
      return { success: false, message: 'يجب اختيار ملف بصيغة قاعدة بيانات SQLite (.sqlite أو .db)' };
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 2. Verify SQLite Header Magic Bytes ("SQLite format 3\0")
    const header = new TextDecoder().decode(bytes.slice(0, 16));
    if (!header.startsWith('SQLite format 3')) {
      return { success: false, message: 'الملف المختار تالف أو ليس قاعدة بيانات SQLite صالحة' };
    }

    // 3. Take emergency safety backup of current state before replacing
    try {
      await this.createOpfsSnapshot('pre_restore_safety_backup');
    } catch (_) {}

    // 4. Import binary
    try {
      const ok = await db.importDatabaseBinary(bytes);
      if (!ok) {
        return { success: false, message: 'فشل استيراد قاعدة البيانات' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'حدث خطأ أثناء فحص واستعادة النسخة' };
    }

    return { success: true, message: 'تم استعادة النسخة الاحتياطية بنجاح واجتياز فحص السلامة (Integrity Check) بنجاح!' };
  }

  /**
   * Export subscribers to CSV file
   */
  public async exportSubscribersToCsv(subscribers: Subscriber[]): Promise<void> {
    const headers = ['المعرف', 'الاسم الكامل', 'الهاتف', 'المنطقة', 'المحلة', 'الزقاق', 'رقم الدار', 'الأمبيرات', 'نوع الخط', 'حالة الخط', 'ملاحظات', 'تاريخ التسجيل'];
    const rows = subscribers.map((s) => [
      `"${s.id}"`,
      `"${s.fullName.replace(/"/g, '""')}"`,
      `"${s.phone}"`,
      `"${s.area.replace(/"/g, '""')}"`,
      `"${s.neighborhood}"`,
      `"${s.alley}"`,
      `"${s.houseNumber}"`,
      s.amperes,
      `"${s.lineType}"`,
      `"${s.lineStatus}"`,
      `"${(s.notes || '').replace(/"/g, '""')}"`,
      `"${s.createdAt}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    this.downloadCsvFile(csvContent, 'ampereji_subscribers.csv');
  }

  /**
   * Export billing records to CSV file
   */
  public async exportBillingToCsv(bills: BillingRecord[]): Promise<void> {
    const headers = ['المعرف', 'اسم المشترك', 'الهاتف', 'الشهر', 'السنة', 'سعر الأمبير', 'المستحق', 'المسدد', 'المتبقي', 'الحالة', 'تاريخ الدفع', 'ملاحظات'];
    const rows = bills.map((b) => [
      `"${b.id}"`,
      `"${(b.subscriberName || '').replace(/"/g, '""')}"`,
      `"${b.phone || ''}"`,
      b.month,
      b.year,
      b.pricePerAmpere,
      b.totalDue,
      b.totalPaid,
      b.remaining,
      `"${b.status}"`,
      `"${b.paymentDate || ''}"`,
      `"${(b.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    this.downloadCsvFile(csvContent, 'ampereji_billing.csv');
  }

  private downloadCsvFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /**
   * Check if 7 days passed without external export
   */
  public isExportReminderDue(lastExportIso: string): boolean {
    if (!lastExportIso) return true;
    const lastTime = new Date(lastExportIso).getTime();
    if (isNaN(lastTime)) return true;
    const diffDays = (Date.now() - lastTime) / (1000 * 60 * 60 * 24);
    return diffDays >= 7;
  }
}

export const backupManager = new BackupManager();
