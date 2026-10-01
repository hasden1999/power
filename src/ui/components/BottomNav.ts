/**
 * src/ui/components/BottomNav.ts
 * Responsive Mobile Bottom Navigation Bar (44px+ touch targets, RTL support)
 */

export type ScreenId = 'subscribers' | 'billing' | 'expenses' | 'reports' | 'settings' | 'saas';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: string;
}

export class BottomNav {
  private element: HTMLElement | null = null;
  private currentScreen: ScreenId = 'subscribers';
  private onNavigate: (screen: ScreenId) => void;

  private items: NavItem[] = [
    { id: 'subscribers', label: 'المشتركون', icon: '👥' },
    { id: 'billing', label: 'الجباية', icon: '💰' },
    { id: 'expenses', label: 'المصاريف', icon: '⛽' },
    { id: 'reports', label: 'التقارير', icon: '📊' },
    { id: 'settings', label: 'الإعدادات', icon: '⚙️' },
  ];

  constructor(onNavigate: (screen: ScreenId) => void) {
    this.onNavigate = onNavigate;
  }

  public mount(container: HTMLElement): void {
    if (this.element) return;

    this.element = document.createElement('nav');
    this.element.id = 'bottom-nav-bar';
    this.element.setAttribute('aria-label', 'شريط التنقل السفلي');
    this.element.className =
      'fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-lg border-t border-cyan-950/80 px-2 py-1.5 shadow-2xl safe-area-pb';

    const inner = document.createElement('div');
    inner.className = 'max-w-md mx-auto grid grid-cols-5 gap-1';

    for (const item of this.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `nav-tab-${item.id}`;
      btn.className = this.getButtonClasses(item.id === this.currentScreen);
      btn.setAttribute('aria-selected', item.id === this.currentScreen ? 'true' : 'false');

      const iconSpan = document.createElement('span');
      iconSpan.className = 'text-xl leading-none mb-1';
      iconSpan.textContent = item.icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'text-[11px] font-bold tracking-tight';
      labelSpan.textContent = item.label;

      btn.appendChild(iconSpan);
      btn.appendChild(labelSpan);

      btn.addEventListener('click', () => {
        this.setActive(item.id);
        this.onNavigate(item.id);
      });

      inner.appendChild(btn);
    }

    this.element.appendChild(inner);
    container.appendChild(this.element);
  }

  public setActive(screen: ScreenId): void {
    this.currentScreen = screen;
    for (const item of this.items) {
      const btn = document.getElementById(`nav-tab-${item.id}`);
      if (btn) {
        const isActive = item.id === screen;
        btn.className = this.getButtonClasses(isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    }
  }

  private getButtonClasses(isActive: boolean): string {
    const base =
      'flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all duration-200 cursor-pointer select-none active:scale-95';
    if (isActive) {
      return `${base} text-cyan-400 bg-cyan-950/50 shadow-sm border border-cyan-800/40`;
    }
    return `${base} text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent`;
  }
}
