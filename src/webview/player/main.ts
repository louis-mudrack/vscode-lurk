import { initializeL10n } from '../common/l10n';
import { PlayerApp } from './playerApp';

initializeL10n();
const root = document.getElementById('app');
if (root) {
  new PlayerApp(root);
}
