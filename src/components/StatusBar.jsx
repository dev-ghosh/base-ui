'use client';

import { useStatus } from '../hooks/useStatus.js';

/** The status bar under the top bar. Same markup as `.sbar` in the old index.html. */
export default function StatusBar() {
  const { status } = useStatus();
  return (
    <div className="sbar">
      <div className={'sdot' + (status.kind ? ' ' + status.kind : '')} id="sdot"></div>
      <span id="stext">{status.msg}</span>
      <span style={{ marginLeft: 'auto', fontSize: '.68rem', color: 'var(--txd)' }} id="smeta">{status.meta}</span>
    </div>
  );
}
