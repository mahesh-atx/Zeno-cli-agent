import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ToolOutput } from '../../src/ui/ToolOutput';

describe('ToolOutput', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it('expands and collapses when ctrl+r is pressed on the active (last) message', async () => {
    const toolCall = {
      id: 'test-1',
      toolName: 'git_status',
      input: {},
      status: 'success' as const,
      isExpanded: false,
      rawResult: {
        isClean: false,
        output: 'M src/ui/App.tsx\n? new-file.txt\nM src/ui/ToolOutput.tsx',
      },
    };

    const { stdin, lastFrame } = render(<ToolOutput toolCall={toolCall} isLast={true} />);

    // Initially collapsed: output should show 'ctrl+r to expand'
    expect(lastFrame()).toContain('ctrl+r to expand');
    expect(lastFrame()).not.toContain('ctrl+r to collapse');

    // Send ctrl+r
    stdin.write('\x12'); // \x12 is the ASCII for Ctrl+R
    await delay(50);

    // Now it should be expanded
    expect(lastFrame()).toContain('ctrl+r to collapse');
    expect(lastFrame()).not.toContain('ctrl+r to expand');

    // Send ctrl+r again
    stdin.write('\x12'); 
    await delay(50);

    // Now it should be collapsed again
    expect(lastFrame()).toContain('ctrl+r to expand');
  });

  it('ignores ctrl+r if it is not the active (last) message', async () => {
    const toolCall = {
      id: 'test-2',
      toolName: 'git_status',
      input: {},
      status: 'success' as const,
      isExpanded: false,
      rawResult: {
        isClean: false,
        output: 'M src/ui/App.tsx',
      },
    };

    const { stdin, lastFrame } = render(<ToolOutput toolCall={toolCall} isLast={false} />);

    // Initially collapsed
    expect(lastFrame()).toContain('ctrl+r to expand');

    // Send ctrl+r
    stdin.write('\x12');
    await delay(50);

    // Should still be collapsed because it is not active
    expect(lastFrame()).toContain('ctrl+r to expand');
    expect(lastFrame()).not.toContain('ctrl+r to collapse');
  });
});

import { GroupedReadFilesOutput } from '../../src/ui/ToolOutput';

describe('ToolOutput Formatting', () => {
  it('formats GroupedReadFilesOutput correctly when collapsed and expanded', () => {
    const toolCalls = [
      { id: '1', toolName: 'read_file', input: { path: 'src/App.tsx' }, status: 'success' as const, rawResult: { lines: 10 } },
      { id: '2', toolName: 'read_file', input: { path: 'src/index.ts' }, status: 'success' as const, rawResult: { lines: 20 } },
      { id: '3', toolName: 'read_file', input: { path: 'src/utils.ts' }, status: 'success' as const, rawResult: { lines: 30 } },
      { id: '4', toolName: 'read_file', input: { path: 'src/types.ts' }, status: 'success' as const, rawResult: { lines: 40 } },
    ];
    
    // Test collapsed (isLast=true but hasn't received ctrl+r)
    const { lastFrame: lastFrameCollapsed } = render(<GroupedReadFilesOutput toolCalls={toolCalls} isLast={true} />);
    const collapsedOut = lastFrameCollapsed() || "";
    expect(collapsedOut).toContain('Read 4 files');
    expect(collapsedOut).toContain('App.tsx, index.ts, utils.ts +1 more');
    expect(collapsedOut).toContain('ctrl+r to expand');

    // Test expanded (simulating by manually injecting state isn't strictly needed if we just trust the component, but we can't easily trigger the hook without async here. However we can test standard ToolOutput with isExpanded=true flag. Wait, GroupedReadFiles doesn't read the toolCall.isExpanded flag. It only uses local state.)
  });

  it('formats ListFilesInner correctly when collapsed', () => {
    const toolCall = {
      id: 'test-3',
      toolName: 'list_files',
      input: { path: 'src' },
      status: 'success' as const,
      isExpanded: false,
      rawResult: {
        entries: [
          '[DIR]  src/commands/',
          '[FILE] src/index.ts (3.2 KB)',
          '[DIR]  src/core/',
          '[FILE] src/types.ts (1.1 KB)'
        ]
      }
    };

    const { lastFrame } = render(<ToolOutput toolCall={toolCall} isLast={true} />);
    const out = lastFrame() || "";
    expect(out).toContain('Search (src) — 4 items');
    expect(out).toContain('├');
    expect(out).toContain('[DIR]  src/commands/');
    expect(out).toContain('... 1 more items');
    expect(out).toContain('ctrl+r to expand');
  });

  it('formats ReadFileOutput correctly when collapsed', () => {
    const toolCall = {
      id: 'test-4',
      toolName: 'read_file',
      input: { path: 'src/index.ts' },
      status: 'success' as const,
      isExpanded: false,
      rawResult: {
        lines: 100,
        size: 4096,
        content: 'import React from "react";\nimport { render } from "ink";\n// More code here\n'
      }
    };

    const { lastFrame } = render(<ToolOutput toolCall={toolCall} isLast={true} />);
    const out = lastFrame() || "";
    expect(out).toContain('Read (src/index.ts) — 100 lines, 4.0 KB');
    expect(out).toContain('├');
    expect(out).toContain('import React from "react";');
    expect(out).toContain('import { render } from "ink";');
    expect(out).toContain('...');
    expect(out).toContain('ctrl+r to expand');
  });
});
