import { useLocation } from 'react-router-dom';
import { GalleryV2 } from './GalleryV2';
import { HomeV2 } from './HomeV2';
import { ProfileV2 } from './ProfileV2';
import { PromptLibraryV2 } from './PromptLibraryV2';
import { ToolsHubV2 } from './ToolsHubV2';
import { TopUpV2 } from './TopUpV2';

export function MobileV2Preview() {
  const screen = new URLSearchParams(useLocation().search).get('screen');
  if (screen === 'tools') return <ToolsHubV2 />;
  if (screen === 'hot') return <PromptLibraryV2 />;
  if (screen === 'history') return <GalleryV2 />;
  if (screen === 'wallet') return <TopUpV2 />;
  if (screen === 'profile') return <ProfileV2 />;
  return <HomeV2 />;
}
