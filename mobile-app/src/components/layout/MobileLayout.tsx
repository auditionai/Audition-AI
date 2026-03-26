import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';

export function MobileLayout() {
  return (
    <div className="mobile-ui-theme min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] pb-20 max-w-md mx-auto relative shadow-2xl xl:rounded-[40px] xl:my-10 xl:overflow-hidden xl:border-[8px] xl:border-neutral-800 xl:min-h-[850px] xl:h-[850px]">
      <TopBar />
      <main className="w-full h-full relative xl:max-h-[850px] xl:overflow-y-auto hide-scrollbar">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
