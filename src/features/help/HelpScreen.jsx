'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../../components/Icon.jsx';
import { useAccess } from '../../hooks/useAccess.js';
import { openAccess } from '../../lib/access-admin.js';
import { toggleHeaderMenu } from '../../lib/menus.js';
import { openMo } from '../../lib/modals.js';
import { openAlertsPanel } from '../../lib/seams.js';
import { SHORTCUTS, TOOLS, helpTarget, visibleTools } from './registry.js';
import { startTour } from './tour.js';

// The search box keeps what was typed while the person is on other screens, as the old module did.
let rememberedQuery = '';

/**
 * Run a Help card's Open button: go to the route (with its search params), or open the overlay that
 * exists, or open the top-bar menu. Replaces the old go(): `switchTabByName` + `later(() => window.x())`.
 */
export function useHelpOpen() {
  const router = useRouter();
  return useCallback((id) => {
    const tool = TOOLS.find((t) => t.id === id);
    const target = tool && helpTarget(tool.open);
    if (!target) return;
    if (target.href) router.push(target.href);
    else if (target.overlay === 'mo-access') openAccess();
    else if (target.overlay) openMo(target.overlay);
    // The menu opens after this click has finished, or the "click outside" handler would close it at once.
    else if (target.menu) setTimeout(() => toggleHeaderMenu(target.menu), 0);
    else if (target.alerts) openAlertsPanel();
  }, [router]);
}

/** Help & tools (old #tab-help): the tool guide in grouped, foldable cards with a search, and the shortcuts. */
export default function HelpScreen() {
  const { isAdmin } = useAccess();
  const open = useHelpOpen();
  const [query, setQuery] = useState(rememberedQuery);
  const onSearch = (v) => { rememberedQuery = v.toLowerCase(); setQuery(v.toLowerCase()); };

  const tools = visibleTools(query, isAdmin);
  const groups = [...new Set(tools.map((t) => t.group))];

  return (
    <div className="tp active" id="tab-help">
      <div id="help-root">
        <div className="pg-wrap">
          <header className="pg-head">
            <div><h1>Help &amp; tools</h1><p>Everything BASE can do, where to find it, and how to use it.</p></div>
            <button type="button" className="btn b-pr" onClick={() => startTour(true)}>Take the 2-minute tour</button>
          </header>
          <div className="hp-search">
            <Icon name="search" size={16} />
            <input
              type="search" id="help-q" placeholder="Search tools, e.g. escalate, export, alerts…"
              aria-label="Search the guide" value={query} onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          <div id="help-tools">
            {!tools.length ? (
              <div className="empty-state sm">
                <div className="empty-ic">?</div>
                <h2>No tool matches “{query}”</h2>
                <p>Try a different word, like “task”, “alert” or “export”.</p>
              </div>
            ) : groups.map((g) => (
              <section className="hp-group" key={g}>
                <h2>{g}</h2>
                <div className="hp-grid">
                  {tools.filter((t) => t.group === g).map((t) => (
                    <details className="hp-card" key={t.id} open={!!query}>
                      <summary>
                        <span className="hp-ic"><Icon name={t.icon} size={20} /></span>
                        <span className="hp-name">{t.name}</span>
                        <span className="hp-where">{t.where}</span>
                      </summary>
                      <div className="hp-body">
                        <p>{t.what}</p>
                        <ol>{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                        {t.keys ? <div className="hp-keys">{t.keys}</div> : null}
                        <button type="button" className="btn b-sm b-ol" onClick={() => open(t.id)}>Open {t.name}</button>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <section className="hp-group">
            <h2>Keyboard shortcuts</h2>
            <div className="hp-keys-grid">{SHORTCUTS.map(([k, v]) => <div key={k}><kbd>{k}</kbd><span>{v}</span></div>)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
