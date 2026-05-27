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

  // Provenance mode — kicks in when `notesOriginal` is supplied (e.g. the
  // chef pasted a customer email into GenerateEventSheet). The popover
  // shows the WHOLE original text with the bullet's source line wrapped in
  // <mark>; bullets that don't match get the "AI paraphrase" badge.

  it('with notesOriginal: popover renders the WHOLE original text', () => {
    const original = 'Hi chef,\nWe have 3 vegans and 1 peanut allergy at the table.\nThanks!';
    render(
      <NotesList
        notes={'3 vegans\n1 peanut allergy'}
        notesOriginal={original}
      />,
    );
    // Both bullets' popovers carry the full original (chef can prove the
    // whole context they were extracted from).
    expect(screen.getByTestId('notes-list-original-0').textContent).toContain('Hi chef,');
    expect(screen.getByTestId('notes-list-original-0').textContent).toContain('Thanks!');
  });

  it('with notesOriginal: each bullet that matches a source line gets a <mark> highlight', () => {
    // Multi-line notes → bullets are rendered (single-line falls back to <p>).
    render(
      <NotesList
        notes={'3 vegans at the table\nNo nuts please'}
        notesOriginal={'Hi chef, we have 3 vegans at the table and no nuts please.'}
      />,
    );
    const mark = screen.getByTestId('notes-list-original-0').querySelector('mark');
    expect(mark?.textContent).toContain('3 vegans at the table');
  });

  it('with notesOriginal: bullets with NO match in the source get a "AI paraphrase" badge', () => {
    render(
      <NotesList
        notes={'Three vegans guests\nNo nuts'}
        notesOriginal={'Could you put together a vegan-friendly menu? Also avoid nuts.'}
      />,
    );
    // Both bullets are paraphrased (neither appears verbatim in the
    // customer text) — chef gets the badge on both so they know to
    // double-check.
    expect(screen.getByTestId('notes-list-paraphrase-0')).toBeTruthy();
    expect(screen.getByTestId('notes-list-paraphrase-0').textContent).toContain('AI paraphrase');
    expect(screen.getByTestId('notes-list-paraphrase-1')).toBeTruthy();
  });

  it('without notesOriginal: NO paraphrase badge (legacy / manual-entry events keep current behaviour)', () => {
    render(<NotesList notes={'something the chef typed\nanother line'} />);
    expect(screen.queryByTestId('notes-list-paraphrase-0')).toBeNull();
  });

  it('with notesOriginal: paraphrased bullets get a visible tint AND data-paraphrase=true; matched ones do not', () => {
    // First bullet matches the source verbatim → no tint.
    // Second bullet is paraphrased → tint + data-paraphrase=true.
    render(
      <NotesList
        notes={'3 vegans at the table\nThree vegetarians guests'}
        notesOriginal={'Hi chef, we have 3 vegans at the table. The night is themed.'}
      />,
    );
    const matched = screen.getByTestId('notes-list-item-0');
    const paraphrase = screen.getByTestId('notes-list-item-1');
    expect(matched.getAttribute('data-paraphrase')).toBe('false');
    expect(paraphrase.getAttribute('data-paraphrase')).toBe('true');
    // Tailwind class includes "purple" only on the paraphrased bullet.
    expect(matched.className).not.toContain('purple');
    expect(paraphrase.className).toContain('purple');
  });
});
