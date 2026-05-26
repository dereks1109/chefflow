import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotesList from './NotesList';

describe('NotesList', () => {
  it('renders nothing when notes are undefined', () => {
    const { container } = render(<NotesList notes={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when notes is empty string', () => {
    const { container } = render(<NotesList notes="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when notes is only whitespace + newlines', () => {
    const { container } = render(<NotesList notes={'   \n  \n'} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single line as a paragraph, not a one-item bullet (no popover surface)', () => {
    const { container } = render(<NotesList notes="Don't forget the lemon zest." />);
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe("Don't forget the lemon zest.");
    // Single-line case has no hover-original popover at all.
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders multiple lines as a bullet list with cleaned visible text per item', () => {
    render(<NotesList notes={'3 vegans\n1 peanut allergy\nNo seafood'} />);
    const list = screen.getByTestId('notes-list');
    expect(list.querySelectorAll('li')).toHaveLength(3);
    // Cleaned text appears on each item. Use the testid for the original-line
    // popover to scope the visible text away from the tooltip body.
    expect(screen.getByTestId('notes-list-item-0').firstChild?.textContent).toContain('3 vegans');
    expect(screen.getByTestId('notes-list-item-2').firstChild?.textContent).toContain('No seafood');
  });

  it('strips leading "- " / "* " / "• " bullet prefixes from the visible bullet text', () => {
    render(<NotesList notes={'- 3 vegans\n* 1 peanut\n• No seafood'} />);
    // The first child of the <li> is the cleaned text node (the popover is a sibling).
    expect(screen.getByTestId('notes-list-item-0').firstChild?.textContent).toContain('3 vegans');
    expect(screen.getByTestId('notes-list-item-0').firstChild?.textContent).not.toContain('-');
    expect(screen.getByTestId('notes-list-item-1').firstChild?.textContent).toContain('1 peanut');
    expect(screen.getByTestId('notes-list-item-2').firstChild?.textContent).toContain('No seafood');
  });

  it('drops empty lines between content lines', () => {
    render(<NotesList notes={'line a\n\n\nline b'} />);
    expect(screen.getByTestId('notes-list').querySelectorAll('li')).toHaveLength(2);
  });

  it('attaches an original-line tooltip to each bullet — visible to hover/focus, preserves the leading marker', () => {
    render(<NotesList notes={'- 3 vegans\n* 1 peanut'} />);
    // Tooltip elements exist (role=tooltip) for each bullet.
    expect(screen.getAllByRole('tooltip')).toHaveLength(2);
    // Original-line content preserves the leading marker.
    expect(screen.getByTestId('notes-list-original-0').textContent).toContain('- 3 vegans');
    expect(screen.getByTestId('notes-list-original-1').textContent).toContain('* 1 peanut');
  });

  it('makes each bullet keyboard-focusable so the popover is reachable without a mouse', () => {
    render(<NotesList notes={'a\nb'} />);
    const items = screen.getAllByTestId(/notes-list-item-/);
    items.forEach((li) => expect(li).toHaveAttribute('tabIndex', '0'));
  });
});
