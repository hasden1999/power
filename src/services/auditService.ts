import { db } from '../db/db';
import { supabase } from './supabaseClient';
import type { AuditLog, AuditAction, AuditEntityType, UserRole } from '../types';

export interface LogAuditParams {
  tenantId: string;
  userId?: string;
  userName: string;
  userRole: UserRole;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  details?: Record<string, any>;
}

/**
 * تسجيل عملية في سجل التدقيق والرقابة (Audit Log)
 * تسجل العمليات الحساسة: قبض مبالغ، تعديل أسعار، تغيير أمبيرات، حذف أو إيقاف مشتركين.
 */
export async function logAuditAction(params: LogAuditParams): Promise<AuditLog> {
  const now = new Date().toISOString();
  const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const auditEntry: AuditLog = {
    id,
    tenantId: params.tenantId,
    userId: params.userId || 'system',
    userName: params.userName || 'مستخدم النظام',
    userRole: params.userRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
    createdAt: now,
  };

  try {
    // 1. الحفظ المحلي في قاعدة بيانات Dexie
    await db.auditLogs.add(auditEntry);

    // 2. إرسال إلى السحابة إن أمكن بدون تعطيل العملية
    if (navigator.onLine) {
      try {
        await supabase.from('audit_logs').insert({
          id: auditEntry.id,
          tenant_id: auditEntry.tenantId,
          user_id: auditEntry.userId,
          user_name: auditEntry.userName,
          user_role: auditEntry.userRole,
          action: auditEntry.action,
          entity_type: auditEntry.entityType,
          entity_id: auditEntry.entityId,
          details: auditEntry.details,
          created_at: auditEntry.createdAt,
        });
      } catch {
        // إذا فشل الاتصال بالسحابة نضيفه لطابور المزامنة
        await db.syncQueue.add({
          id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          action: 'insert',
          entity: 'auditLogs',
          entityId: auditEntry.id,
          payload: auditEntry,
          createdAt: now,
          attempts: 0,
        });
      }
    } else {
      // وضع الأوفلاين: الإضافة لطابور المزامنة
      await db.syncQueue.add({
        id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        action: 'insert',
        entity: 'auditLogs',
        entityId: auditEntry.id,
        payload: auditEntry,
        createdAt: now,
        attempts: 0,
      });
    }
  } catch (err) {
    console.warn('تعذر تسجيل عملية التدقيق:', err);
  }

  return auditEntry;
}

/**
 * جلب سجلات التدقيق الخاصة بمولدة معينة
 */
export async function getAuditLogs(tenantId: string, limit = 100): Promise<AuditLog[]> {
  try {
    const logs = await db.auditLogs
      .where('tenantId')
      .equals(tenantId)
      .reverse()
      .sortBy('createdAt');
    return logs.slice(0, limit);
  } catch (err) {
    console.error('خطأ في جلب سجلات التدقيق:', err);
    return [];
  }
}

/**
 * ترجمة أسماء الإجراءات إلى العربية لعرضها في واجهة الرقابة
 */
export function getActionLabel(action: AuditAction): { label: string; color: string } {
  switch (action) {
    case 'payment_recorded':
      return { label: 'قبض دفعة', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    case 'create':
      return { label: 'إضافة جديدة', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    case 'update':
      return { label: 'تعديل بيانات', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    case 'delete':
      return { label: 'حذف سجل', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
    case 'price_changed':
      return { label: 'تغيير تسعيرة', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
    case 'debt_adjusted':
      return { label: 'تسوية ديون', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' };
    case 'login':
      return { label: 'تسجيل دخول', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' };
    case 'logout':
      return { label: 'تسجيل خروج', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
    default:
      return { label: action, color: 'bg-slate-700 text-slate-300 border-slate-600' };
  }
}
