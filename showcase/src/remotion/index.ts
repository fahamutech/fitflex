import { registerRoot, staticFile } from 'remotion';
import { setAssetResolver } from '../shared/asset';
import { RemotionRoot } from './Root';

setAssetResolver((p) => staticFile(p));
registerRoot(RemotionRoot);
