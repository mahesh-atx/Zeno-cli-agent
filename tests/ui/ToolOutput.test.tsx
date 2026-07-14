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
