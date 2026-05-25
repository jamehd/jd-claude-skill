## Pattern: Vue - Missing Error Handlers
**Severity:** High
**Boost rule:** Critical for app-root
**Dimension:** A (Code-level), E (User-facing)

### Detection
Composite check (orchestrator):

1. Is `vue` in `package.json`? If not, SKIP.
2. Ripgrep command(s):
- `rg -t ts -t js -t vue --files-with-matches "app\.config\.errorHandler"`
- `rg -t ts -t js -t vue --files-with-matches "errorCaptured"`
3. If Vue present AND neither found -> FLAG "no app-level errorHandler; uncaught component errors will only log to console".

### Why this matters
- `app.config.errorHandler` is the global hook called for any uncaught error in Vue components (render errors, lifecycle hook errors, watcher callbacks). Without it, errors are only logged to console - invisible to Sentry/observability.
- `errorCaptured` on a parent component intercepts errors from descendants - useful for per-feature error boundaries.

### Fix template
```after
// main.ts
import { createApp } from 'vue';
import * as Sentry from '@sentry/vue';
import App from './App.vue';

const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue error:', err, info);
  Sentry.captureException(err, { extra: { info, componentName: instance?.$options.name } });
};

app.mount('#app');
```

For per-component boundary:
```vue
<script setup lang="ts">
import { onErrorCaptured } from 'vue';

onErrorCaptured((err, instance, info) => {
  Sentry.captureException(err, { extra: { info } });
  return false; // stop propagation - show fallback
});
</script>
```

### Reference
- `references/best-practices-per-stack.md#vue-3`
- Vue docs: https://vuejs.org/api/application.html#app-config-errorhandler
