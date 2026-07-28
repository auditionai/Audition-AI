import type { ReactNode } from 'react';
import { About } from '../../views/About';
import { AdminView } from '../../views/Admin';
import { Gallery } from '../../views/Gallery';
import { Guide } from '../../views/Guide';
import { PaymentGatewayView } from '../../views/PaymentGateway';
import { PromptLibrary } from '../../views/PromptLibrary';
import { Settings } from '../../views/Settings';
import { Support } from '../../views/Support';
import { TopUp } from '../../views/TopUp';
import { WorkspaceEdit } from '../../views/WorkspaceEdit';
import { WorkspaceImage } from '../../views/WorkspaceImage';
import { WorkspacePromptImage } from '../../views/WorkspacePromptImage';
import { WorkspaceVideo } from '../../views/WorkspaceVideo';
import { V2RouteHero } from '../components/V2RouteHero';

type V2FeatureFrameProps = {
  kind: string;
  children: ReactNode;
  immersive?: boolean;
};

function V2FeatureFrame({ kind, children, immersive = false }: V2FeatureFrameProps) {
  return (
    <div className={`v2-native-page v2-native-page--${kind}${immersive ? ' is-immersive' : ''}`}>
      <V2RouteHero />
      <div className="v2-native-page__workspace">{children}</div>
    </div>
  );
}

export const ImageStudioV2 = () => <V2FeatureFrame kind="image" immersive><WorkspaceImage /></V2FeatureFrame>;
export const VideoStudioV2 = () => <V2FeatureFrame kind="video" immersive><WorkspaceVideo /></V2FeatureFrame>;
export const PromptImageStudioV2 = () => <V2FeatureFrame kind="composer" immersive><WorkspacePromptImage /></V2FeatureFrame>;
export const EditStudioV2 = () => <V2FeatureFrame kind="editor" immersive><WorkspaceEdit /></V2FeatureFrame>;
export const PromptLibraryV2 = () => <V2FeatureFrame kind="templates"><PromptLibrary /></V2FeatureFrame>;
export const GalleryV2 = () => <V2FeatureFrame kind="history"><Gallery /></V2FeatureFrame>;
export const TopUpV2 = () => <V2FeatureFrame kind="wallet"><TopUp /></V2FeatureFrame>;
export const PaymentGatewayV2 = () => <V2FeatureFrame kind="payment"><PaymentGatewayView /></V2FeatureFrame>;
export const ProfileV2 = () => <V2FeatureFrame kind="profile"><Settings /></V2FeatureFrame>;
export const AboutV2 = () => <V2FeatureFrame kind="academy"><About /></V2FeatureFrame>;
export const SupportV2 = () => <V2FeatureFrame kind="academy"><Support /></V2FeatureFrame>;
export const GuideV2 = () => <V2FeatureFrame kind="academy"><Guide /></V2FeatureFrame>;
export const AdminV2 = () => <V2FeatureFrame kind="admin"><AdminView /></V2FeatureFrame>;
