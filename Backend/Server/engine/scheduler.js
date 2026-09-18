// engine/scheduler.js
// Runs periodic jobs: auto-complete sweep, notifications processing.
const autoComplete = require('./auto-complete');

let timer = null;
let lastRun = null;
let runs = 0;

async function tick() {
    try {
        const sweep = await autoComplete.runSweep();
        runs++;
        lastRun = new Date();
        if (sweep.swept > 0) {
            console.log('[scheduler] auto-complete swept ' + sweep.swept + ' order(s)');
        }
    } catch (e) {
        console.error('[scheduler] tick error:', e.message);
    }
}

function startScheduler(intervalMs) {
    if (timer) {
        console.log('[scheduler] already running');
        return;
    }
    const ms = intervalMs || 60000;
    timer = setInterval(tick, ms);
    console.log('[scheduler] started ??? auto-complete sweep every ' + (ms/1000) + 's');
    // Run once immediately
    setTimeout(tick, 1000);
}

function stopScheduler() {
    if (timer) { clearInterval(timer); timer = null; console.log('[scheduler] stopped'); }
}

function status() {
    return { running: !!timer, runs, last_run: lastRun };
}

module.exports = { startScheduler, stopScheduler, tick, status };
