import { initializeL10n } from '../common/l10n';
import { ChatApp } from './chatApp';

initializeL10n();
const root = document.getElementById('app');
if (root) {
  new ChatApp(root);
}
