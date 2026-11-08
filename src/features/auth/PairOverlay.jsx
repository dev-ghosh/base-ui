'use client';

import { useModal } from '../../hooks/useModal.js';
import PairShow from './PairShow.jsx';

/** The id Profile, Help and `/profile?pair=1` open (openMo('mo-pair')). */
export const PAIR_MODAL_ID = 'mo-pair';

/**
 * "Sign in another device" (old mo-pair), mounted once in the (app) layout. A QR code is minted when it
 * opens and burned when it closes (PairShow), so it is mounted only while open: a closed overlay holds
 * no live code.
 */
export default function PairOverlay() {
  const { open, hide } = useModal(PAIR_MODAL_ID);
  return open ? <PairShow onClose={hide} /> : null;
}
