const {
  computeSplitGrid,
  enumerateSplitPanes,
  MAX_SPLIT_PANES,
} = require("../../utils/vela/splitChatLayout.cjs");

describe("splitChatLayout", () => {
  test("computeSplitGrid respects 3x4 cap", () => {
    expect(computeSplitGrid(1)).toEqual({ rows: 1, cols: 1 });
    expect(computeSplitGrid(2)).toEqual({ rows: 1, cols: 2 });
    expect(computeSplitGrid(4)).toEqual({ rows: 2, cols: 2 });
    expect(computeSplitGrid(12)).toEqual({ rows: 3, cols: 4 });
    const grid = computeSplitGrid(99);
    expect(grid.rows * grid.cols).toBeLessThanOrEqual(MAX_SPLIT_PANES);
  });

  test("enumerateSplitPanes caps workers and reports overflow", () => {
    const workerMap = {};
    for (let i = 0; i < 15; i += 1) {
      workerMap[`run-${i}`] = {
        threadSlug: `w-${i}`,
        parentThreadSlug: "main",
        runId: `run-${i}`,
        roleId: "concept-artist",
      };
    }
    const { panes, overflowCount } = enumerateSplitPanes({
      workspaceSlug: "ws",
      mainThreadSlug: "main",
      workerMap,
      runs: [],
    });
    expect(panes.length).toBe(MAX_SPLIT_PANES);
    expect(overflowCount).toBe(4);
    expect(panes[0].isMain).toBe(true);
  });
});
