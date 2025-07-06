const path = require('path');

const scheduledTasks = {};

function resolveHandler(handlerStr) {
  const [moduleName, functionName] = handlerStr.split('.');
  if (!moduleName || !functionName) return null;

  try {
    const mod = require(path.join(global.BASE_DIR, 'services', moduleName));
    if (typeof mod[functionName] === 'function') {
      return mod[functionName];
    }
    console.warn(`[Scheduler] Handler '${functionName}' not found in module '${moduleName}'`);
    return null;
  } catch (err) {
    console.warn(`[Scheduler] Failed to load module '${moduleName}':`, err.message);
    return null;
  }
}

function clearAllTasks() {
  for (const id of Object.values(scheduledTasks)) {
    clearInterval(id);
  }
  Object.keys(scheduledTasks).forEach(key => delete scheduledTasks[key]);
}

function startScheduledTasks() {
  let tasks = {};
  try {
    const config = require(global.BASE_DIR + '/utils/config');
    tasks = config.schedule?.tasks || {};
  } catch (err) {
    console.warn('[Scheduler] Could not load schedule from config:', err.message);
  }

  console.log('[Scheduler] Starting scheduled tasks:');
  for (const [taskName, taskCfg] of Object.entries(tasks)) {
    (function(taskName, taskCfg) {
      const interval = parseFloat(taskCfg.intervalMinutes) * 60 * 1000;
      const handler = resolveHandler(taskCfg.handler);

      if (!handler || isNaN(interval) || interval <= 0) {
        console.warn(`[Scheduler] Skipping invalid task '${taskName}'`);
        return;
      }

      console.log(`  • ${taskName} → ${taskCfg.handler} every ${taskCfg.intervalMinutes} minute(s)`);

      const runTask = async () => {
        const start = Date.now();
        console.log(`[Scheduler] Running task '${taskName}'...`);
        try {
          await handler();
          const duration = ((Date.now() - start) / 1000).toFixed(2);
          console.log(`[Scheduler] Task '${taskName}' completed in ${duration}s`);
        } catch (err) {
          console.error(`[Scheduler] Task '${taskName}' failed:`, err);
        }
      };

      runTask();
      scheduledTasks[taskName] = setInterval(runTask, interval);
    })(taskName, taskCfg);
  }
}

function reloadScheduledTasks() {
  console.log('[Scheduler] Reloading scheduled tasks due to config change...');
  clearAllTasks();
  startScheduledTasks();
}

module.exports = {
  startScheduledTasks,
  reloadScheduledTasks
};
