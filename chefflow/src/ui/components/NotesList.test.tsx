import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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

  it('renders a single line as a paragraph, not a one-item bullet', () => {
    const { container } = render(<NotesList notes="Don't forget the lemon zest." />);
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe("Don't forget the lemon zest.");
  });

  it('renders multiple lines as a bullet list', () => {
    const { container } = render(
      <NotesList notes={'3 vegans\n1 peanut allergy\nNo seafood'} />,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe('3 vegans');
    expect(items[2].textContent).toBe('No seafood');
  });

  it('strips leading "- " / "* " / "• " bullet prefixes', () => {
    const { container } = render(
      <NotesList notes={'- 3 vegans\n* 1 peanut\n• No seafood'} />,
    );
    const items = container.querySelectorAll('li');
    expect(items[0].textContent).toBe('3 vegans');
    expect(items[1].textContent).toBe('1 peanut');
    expect(items[2].textContent).toBe('No seafood');
  });

  it('drops empty lines between content lines', () => {
    const { container } = render(<NotesList notes={'line a\n\n\nline b'} />);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
  });
});
