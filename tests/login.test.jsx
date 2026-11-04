import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

process.env.NEXT_PUBLIC_SB_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SB_KEY = 'anon-key-123';

const nav = vi.hoisted(() => ({ replace: null, search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// Real implementations everywhere except the network- and camera-facing calls.
vi.mock('@/lib/auth.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    sendMagicLink: vi.fn(),
    verifyEmailCode: vi.fn(),
    verifySignInLink: vi.fn(),
    scheduleAutoRefresh: vi.fn(),
  };
});
vi.mock('@/lib/devicepair.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, canScan: vi.fn(() => false), startScanner: vi.fn(), claimPairing: vi.fn() };
});
vi.mock('@/lib/platform.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, isStandalone: vi.fn(() => false), isIOS: vi.fn(() => false), isNativeShell: vi.fn(() => false) };
});

import LoginPage from '@/app/login/page.jsx';
import * as auth from '@/lib/auth.js';
import * as dp from '@/lib/devicepair.js';
import * as platform from '@/lib/platform.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
const SESSION = { accessToken: 't', refreshToken: 'r', email: 'a@example.com', displayName: 'A' };

beforeEach(() => {
  nav.replace = vi.fn();
  nav.search = '';
  localStorage.clear();
  vi.mocked(dp.canScan).mockReturnValue(false);
  vi.mocked(platform.isStandalone).mockReturnValue(false);
  vi.mocked(platform.isIOS).mockReturnValue(false);
  vi.mocked(auth.sendMagicLink).mockReset();
  vi.mocked(auth.verifyEmailCode).mockReset();
  vi.mocked(auth.verifySignInLink).mockReset();
  vi.mocked(dp.startScanner).mockReset();
  vi.mocked(dp.claimPairing).mockReset();
});
afterEach(() => cleanup());

async function renderLogin() {
  const utils = render(<LoginPage />);
  await screen.findByText('Sign in to BASE');
  return utils;
}
const emailInput = () => document.getElementById('auth-email');
async function sendCodeTo(email) {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
  await screen.findByText('Check your inbox');
}

describe('/login: shell and redirect', () => {
  it('redirects to /today when a session exists and shows no form', async () => {
    localStorage.setItem('rie_session', JSON.stringify({ ...SESSION, expiresAt: Date.now() + 9e9 }));
    render(<LoginPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/today'));
    expect(screen.queryByText('Sign in to BASE')).toBeNull();
  });

  it('renders the old modal structure, centred by the same classes', async () => {
    await renderLogin();
    const mo = document.getElementById('mo-user');
    expect(mo.className).toBe('mo open');
    const mb = mo.querySelector('.mb');
    expect(mb.style.maxWidth).toBe('380px');
    expect(mb.querySelector('.mh .mti').textContent).toBe('Sign in to BASE');
    expect(mo.querySelector('#auth-choices.auth-choices .ac-email')).toBeTruthy();
    expect(mo.querySelector('.ac-sep').textContent).toBe('or');
    expect(mo.querySelector('.ac-pair')).toBeTruthy();
    expect(emailInput().className).toBe('fi');
    expect(emailInput().getAttribute('placeholder')).toBe('you@example.com');
    expect(document.getElementById('auth-send-btn').className).toBe('btn b-pr');
    expect(screen.getByText('Sign in by email').className).toBe('msl');
    expect(screen.getByText("We'll email you a numeric code. No password.")).toBeTruthy();
    expect(screen.getByText("Use a device you're already on").className).toBe('msl');
    expect(screen.getByRole('button', { name: 'Type the pairing code instead' })).toBeTruthy();
  });

  it('shows a sentence for ?error=link and for ?error=pair', async () => {
    nav.search = 'error=link';
    const { unmount } = await renderLogin();
    expect(screen.getByRole('alert').textContent).toMatch(/sign-in link/i);
    unmount();
    nav.search = 'error=pair';
    await renderLogin();
    expect(screen.getByRole('alert').textContent).toBe('That pairing code is wrong, used, or expired. Show a new QR code.');
  });

  it('ignores an unknown ?error= value', async () => {
    nav.search = 'error=whatever';
    await renderLogin();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides the camera button where no camera can open, shows it otherwise', async () => {
    const { unmount } = await renderLogin();
    expect(screen.queryByRole('button', { name: /Scan the QR code/ })).toBeNull();
    unmount();
    vi.mocked(dp.canScan).mockReturnValue(true);
    await renderLogin();
    expect(screen.getByRole('button', { name: '📷 Scan the QR code' })).toBeTruthy();
  });

  it('leads with pairing on the installed app / iOS (pair-first), and offers the login-code paste only when installed', async () => {
    vi.mocked(platform.isIOS).mockReturnValue(true);
    const { unmount } = await renderLogin();
    expect(document.getElementById('auth-choices').classList.contains('pair-first')).toBe(true);
    expect(screen.queryByText('Paste a login code from my browser')).toBeNull();
    unmount();
    vi.mocked(platform.isStandalone).mockReturnValue(true);
    await renderLogin();
    expect(screen.getByText('Paste a login code from my browser')).toBeTruthy();
  });
});

describe('/login: email code', () => {
  it('asks for an email first', async () => {
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter your email address');
    expect(auth.sendMagicLink).not.toHaveBeenCalled();
  });

  it('sends the code (trimmed), then shows the code pane', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    await renderLogin();
    await sendCodeTo('  a@example.com ');
    expect(auth.sendMagicLink).toHaveBeenCalledWith('a@example.com');
    expect(screen.getByText('Enter the code from the email.')).toBeTruthy();
    const code = document.getElementById('auth-code');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code.getAttribute('maxlength')).toBe('10');
    expect(document.activeElement).toBe(code);
  });

  it('shows a send failure and re-enables the button', async () => {
    vi.mocked(auth.sendMagicLink).mockRejectedValue(new Error('This email is not authorised for BASE.'));
    await renderLogin();
    fireEvent.change(emailInput(), { target: { value: 'x@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not send code: This email is not authorised for BASE.');
    expect(document.getElementById('auth-send-btn').disabled).toBe(false);
  });

  it('Enter in the email field sends', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    await renderLogin();
    fireEvent.change(emailInput(), { target: { value: 'a@example.com' } });
    fireEvent.keyDown(emailInput(), { key: 'Enter' });
    await screen.findByText('Check your inbox');
  });

  it('strips non-digits and auto-submits at OTP_LENGTH (8), then replaces to /today', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    vi.mocked(auth.verifyEmailCode).mockResolvedValue(SESSION);
    await renderLogin();
    await sendCodeTo('a@example.com');
    const code = document.getElementById('auth-code');
    fireEvent.change(code, { target: { value: '12ab34' } });
    expect(code.value).toBe('1234');
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: '12345678' } });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/today'));
    expect(auth.verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(auth.verifyEmailCode).toHaveBeenCalledWith('a@example.com', '12345678');
  });

  it('a wrong code shows the message, clears the box and refocuses it', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    vi.mocked(auth.verifyEmailCode).mockRejectedValue(new Error('That code is wrong or has expired — send a new one.'));
    await renderLogin();
    await sendCodeTo('a@example.com');
    const code = document.getElementById('auth-code');
    fireEvent.change(code, { target: { value: '12345678' } });
    await waitFor(() => expect(document.getElementById('auth-code-err').textContent)
      .toBe('That code is wrong or has expired — send a new one.'));
    expect(code.value).toBe('');
    expect(document.activeElement).toBe(code);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('Sign in with nothing entered says what to enter', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    await renderLogin();
    await sendCodeTo('a@example.com');
    fireEvent.click(document.getElementById('auth-code-btn'));
    expect(document.getElementById('auth-code-err').textContent).toBe('Enter the 6-digit code, or paste the sign-in link.');
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();
  });

  it('a pasted link wins over a typed code and does not auto-submit a code', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    vi.mocked(auth.verifySignInLink).mockResolvedValue(SESSION);
    await renderLogin();
    await sendCodeTo('a@example.com');
    const link = document.getElementById('auth-link');
    fireEvent.change(link, { target: { value: ' https://x.supabase.co/auth/v1/verify?token=abc&type=magiclink ' } });
    fireEvent.change(document.getElementById('auth-code'), { target: { value: '12345678' } });
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();     // link present: no auto-submit
    fireEvent.click(document.getElementById('auth-code-btn'));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/today'));
    expect(auth.verifySignInLink).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/verify?token=abc&type=magiclink');
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();
  });

  it('a failed link keeps the pasted link so it need not be copied again', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    vi.mocked(auth.verifySignInLink).mockRejectedValue(new Error('That link has expired or was already used.'));
    await renderLogin();
    await sendCodeTo('a@example.com');
    const link = document.getElementById('auth-link');
    fireEvent.change(link, { target: { value: 'https://x.supabase.co/auth/v1/verify?token=abc' } });
    fireEvent.click(document.getElementById('auth-code-btn'));
    await waitFor(() => expect(document.getElementById('auth-code-err').textContent).toBe('That link has expired or was already used.'));
    expect(link.value).toBe('https://x.supabase.co/auth/v1/verify?token=abc');
  });

  it('"Use a different email" goes back to the email form', async () => {
    vi.mocked(auth.sendMagicLink).mockResolvedValue(undefined);
    await renderLogin();
    await sendCodeTo('a@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(emailInput()).toBeTruthy();
    expect(document.getElementById('auth-send-btn').disabled).toBe(false);
  });
});

describe('/login: pairing code entry', () => {
  async function openCodeEntry() {
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Type the pairing code instead' }));
    return document.getElementById('pair-input');
  }

  it('upper-cases, regroups as ABCDE-FGHJKLM, and claims once 12 characters land', async () => {
    vi.mocked(dp.claimPairing).mockResolvedValue(SESSION);
    const input = await openCodeEntry();
    expect(input.getAttribute('placeholder')).toBe('ABCDE-FGHJKLM');
    expect(input.className).toBe('fi pair-in');
    fireEvent.change(input, { target: { value: 'abcde' } });
    expect(input.value).toBe('ABCDE');
    expect(dp.claimPairing).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'abcdefghjklm' } });
    expect(input.value).toBe('ABCDE-FGHJKLM');
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/today'));
    expect(dp.claimPairing).toHaveBeenCalledTimes(1);
    expect(dp.claimPairing).toHaveBeenCalledWith('ABCDEFGHJKLM');
  });

  it('a refused code shows the sentence, clears the box and refocuses it', async () => {
    vi.mocked(dp.claimPairing).mockRejectedValue(new Error('That pairing code is wrong, used, or expired. Show a new QR code.'));
    const input = await openCodeEntry();
    fireEvent.change(input, { target: { value: 'ABCDEFGHJKLM' } });
    await waitFor(() => expect(document.getElementById('pair-err').textContent).toMatch(/pairing code is wrong/));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('Back returns to the choices', async () => {
    await openCodeEntry();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(emailInput()).toBeTruthy();
  });
});

describe('/login: QR scan', () => {
  let stop;
  let onCode;
  beforeEach(() => {
    vi.mocked(dp.canScan).mockReturnValue(true);
    stop = vi.fn();
    onCode = null;
    vi.mocked(dp.startScanner).mockImplementation(async (video, cb) => { onCode = cb; return stop; });
  });

  it('opens the camera on the <video>, hides the hint once frames flow, claims a scanned code', async () => {
    vi.mocked(dp.claimPairing).mockResolvedValue(SESSION);
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    expect(screen.getByText('Point the camera at the QR code on your other device.')).toBeTruthy();
    await waitFor(() => expect(dp.startScanner).toHaveBeenCalled());
    expect(dp.startScanner.mock.calls[0][0]).toBe(document.getElementById('scan-video'));
    expect(document.querySelector('.scan-box .scan-reticle')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Allow camera access when your browser asks.')).toBeNull());
    await act(async () => { onCode('ABCDEFGHJKLM'); });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/today'));
    expect(dp.claimPairing).toHaveBeenCalledWith('ABCDEFGHJKLM');
  });

  it('a camera error is shown and the hint goes away', async () => {
    vi.mocked(dp.startScanner).mockRejectedValue(new Error('Camera access was denied. Allow it in Settings, or type the code instead.'));
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    await waitFor(() => expect(document.getElementById('scan-err').textContent).toMatch(/Camera access was denied/));
    expect(screen.queryByText('Allow camera access when your browser asks.')).toBeNull();
  });

  it('a refused scan drops to the typed-code form and says why', async () => {
    vi.mocked(dp.claimPairing).mockRejectedValue(new Error('That pairing code is wrong, used, or expired. Show a new QR code.'));
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    await waitFor(() => expect(onCode).toBeTruthy());
    await act(async () => { onCode('ABCDEFGHJKLM'); });
    await waitFor(() => expect(document.getElementById('pair-input')).toBeTruthy());
    expect(document.getElementById('pair-err').textContent).toMatch(/pairing code is wrong/);
  });

  it('releases the camera on "Type the code instead", on Back and on unmount', async () => {
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    await waitFor(() => expect(onCode).toBeTruthy());
    await act(async () => {});            // let startScanner() resolve with its stop function
    fireEvent.click(screen.getByRole('button', { name: 'Type the code instead' }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(document.getElementById('pair-input')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    await waitFor(() => expect(dp.startScanner).toHaveBeenCalledTimes(2));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(stop).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    await waitFor(() => expect(dp.startScanner).toHaveBeenCalledTimes(3));
    await act(async () => {});
    cleanup();
    expect(stop).toHaveBeenCalledTimes(3);
  });

  it('stops a scanner that finished opening after the screen was left', async () => {
    let resolveStart;
    vi.mocked(dp.startScanner).mockImplementation(() => new Promise((r) => { resolveStart = () => r(stop); }));
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '📷 Scan the QR code' }));
    await waitFor(() => expect(dp.startScanner).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(stop).not.toHaveBeenCalled();
    await act(async () => { resolveStart(); });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('/login: login-code paste (installed app only)', () => {
  beforeEach(() => vi.mocked(platform.isStandalone).mockReturnValue(true));

  it('rejects something that is not a login code', async () => {
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Paste a login code from my browser' }));
    fireEvent.change(document.getElementById('paste-code'), { target: { value: '!!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(document.getElementById('paste-err').textContent).toBe('That does not look like a login code.');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('accepts a code from exportLoginCode, stores the session and replaces to /today', async () => {
    const at = jwt({ sub: 'u1', email: 'a@example.com' });
    localStorage.setItem('rie_session', JSON.stringify({ accessToken: at, refreshToken: 'r', expiresAt: Date.now() + 9e9 }));
    const code = platform.exportLoginCode();
    localStorage.clear();
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Paste a login code from my browser' }));
    const box = document.getElementById('paste-code');
    fireEvent.change(box, { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/today'));
    expect(JSON.parse(localStorage.getItem('rie_session')).accessToken).toBe(at);
  });

  it('Back returns to the choices', async () => {
    await renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Paste a login code from my browser' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(emailInput()).toBeTruthy();
  });
});
