import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// إدارة تحديثات المنظومة وسيرفس وركر دون مقاطعة إدخال بيانات المستخدم
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // إرسال حدث مخصص للمتصفح لإعلام واجهة المستخدم بوجود تحديث جديد
    window.dispatchEvent(new CustomEvent('app-update-ready'));
  });

  navigator.serviceWorker.ready.then((reg) => {
    reg.update();
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
