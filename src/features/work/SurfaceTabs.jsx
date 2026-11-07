'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useScope } from './hooks/useScope.js';

/** The five surfaces, in the old order. `id` is the old button id (#tvw-*; Board was `flat`). */
export const SURFACES = [
  { id: 'tvw-matrix', label: 'Matrix', href: '/work/matrix' },
  { id: 'tvw-flat', label: 'Board', href: '/work/board' },
  { id: 'tvw-hierarchy', label: 'Hierarchy', href: '/work/hierarchy' },
  { id: 'tvw-initiatives', label: 'Initiatives', href: '/work/initiatives' },
  { id: 'tvw-decide', label: 'Decide', href: '/work/decide' },
];

const isActive = (pathname, href) => pathname === href || pathname.startsWith(href + '/');

/**
 * The surface switcher (#task-viewseg). The surfaces are routes (spec C7), so these are links
 * and the lit one comes from the pathname. A scope chosen in the URL rides along in the link so
 * the same scope is on screen whichever surface you land on.
 */
export default function SurfaceTabs() {
  const pathname = usePathname() ?? '';
  const { urlScope } = useScope();
  return (
    <div className="mx-seg" id="task-viewseg" role="tablist" aria-label="Task view">
      {SURFACES.map((s) => {
        const on = isActive(pathname, s.href);
        return (
          <Link
            key={s.id}
            id={s.id}
            href={urlScope ? `${s.href}?scope=${urlScope}` : s.href}
            className={on ? 'on' : ''}
            aria-current={on ? 'page' : undefined}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
