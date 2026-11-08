// HR automation: the iframe of the separate HR app, and the theme message it listens for. The frame's
// contentWindow.postMessage is spied on; jsdom does not load the frame, so its load event is fired by hand.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import HrPage from '@/app/(app)/hr-automation/page.jsx';
import HrFrame from '@/features/hr/HrFrame.jsx';
import { setTheme } from '@/lib/theme.js';

const URL_ENV = 'http://localhost:3000';
const frame = () => document.getElementById('hr-automation-frame');

beforeEach(() => {
  process.env.NEXT_PUBLIC_HR_AUTOMATION_URL = URL_ENV;
  document.documentElement.setAttribute('data-theme', 'dark');
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  delete process.env.NEXT_PUBLIC_HR_AUTOMATION_URL;
  vi.restoreAllMocks();
});

const spyOnFrame = () => vi.spyOn(frame().contentWindow, 'postMessage').mockImplementation(() => {});

describe('HrFrame', () => {
  it('renders the iframe at the configured address, as the old page had it', () => {
    render(<HrPage />);
    const f = frame();
    expect(f.tagName).toBe('IFRAME');
    expect(f.getAttribute('src')).toBe(URL_ENV);
    expect(f.getAttribute('title')).toBe('HR automation');
    expect(f.style.minHeight).toBe('calc(100vh - 60px)');
    expect(f.style.border).toMatch(/^(0|0px)/);
    expect(document.getElementById('tab-hr-automation').className).toBe('tp page active');
  });

  it('posts { type: "rie-theme", theme } to the frame\'s origin when the frame loads', () => {
    render(<HrFrame />);
    const post = spyOnFrame();
    expect(post).not.toHaveBeenCalled();                      // nothing before the frame has loaded
    fireEvent.load(frame());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'rie-theme', theme: 'dark' }, 'http://localhost:3000');
  });

  it('posts again when the theme changes, with the new theme', () => {
    render(<HrFrame />);
    const post = spyOnFrame();
    fireEvent.load(frame());
    act(() => setTheme('light'));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith({ type: 'rie-theme', theme: 'light' }, 'http://localhost:3000');
    act(() => setTheme('spc-modern'));
    expect(post).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenLastCalledWith({ type: 'rie-theme', theme: 'spc-modern' }, 'http://localhost:3000');
  });

  it('a theme change before the frame has loaded posts nothing (the load posts the current one)', () => {
    render(<HrFrame />);
    const post = spyOnFrame();
    act(() => setTheme('light'));
    expect(post).not.toHaveBeenCalled();
    fireEvent.load(frame());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'rie-theme', theme: 'light' }, 'http://localhost:3000');
  });

  it('uses only the origin of the address, never a wildcard', () => {
    process.env.NEXT_PUBLIC_HR_AUTOMATION_URL = 'https://hr.example.com:8443/app/index.html?x=1';
    render(<HrFrame />);
    const post = spyOnFrame();
    fireEvent.load(frame());
    expect(post.mock.calls[0][1]).toBe('https://hr.example.com:8443');
    expect(post.mock.calls[0][1]).not.toBe('*');
  });

  it('says so when the address is not configured, and posts nothing', () => {
    delete process.env.NEXT_PUBLIC_HR_AUTOMATION_URL;
    render(<HrFrame />);
    expect(frame()).toBeNull();
    expect(document.body.textContent).toContain('HR automation is not set up');
  });

  it('does not throw for an address that is not a URL', () => {
    process.env.NEXT_PUBLIC_HR_AUTOMATION_URL = 'not a url';
    render(<HrFrame />);
    spyOnFrame();
    expect(() => fireEvent.load(frame())).not.toThrow();
  });
});
