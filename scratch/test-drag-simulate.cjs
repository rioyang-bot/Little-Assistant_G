const assert = require('node:assert/strict');
const { app, screen } = require('electron');

app.whenReady().then(() => {
  try {
    const { workArea } = screen.getPrimaryDisplay();
    const winW = 330;
    const bearSize = 190;
    const bearMarginX = 6;
    const screenCenterX = workArea.x + workArea.width / 2;

    function calculateDock(targetBearX) {
      const dock = targetBearX + bearSize / 2 < screenCenterX ? 'left' : 'right';
      let targetWinX = dock === 'left'
        ? targetBearX - bearMarginX
        : targetBearX - (winW - bearSize - bearMarginX);
      targetWinX = Math.max(
        workArea.x,
        Math.min(workArea.x + workArea.width - winW, targetWinX)
      );
      return { dock, targetWinX };
    }

    const left = calculateDock(workArea.x + 10);
    const right = calculateDock(workArea.x + workArea.width - bearSize - 10);

    assert.equal(left.dock, 'left');
    assert.equal(right.dock, 'right');

    for (const result of [left, right]) {
      assert.ok(result.targetWinX >= workArea.x);
      assert.ok(result.targetWinX + winW <= workArea.x + workArea.width);
    }

    console.log('Electron docking calculation assertions passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
