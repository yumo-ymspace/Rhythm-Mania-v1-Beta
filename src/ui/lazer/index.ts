/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

export { FooterBackButton } from './FooterBackButton';
export { LazerCookie, LAZER_COOKIE_BAR_COUNT, LAZER_COOKIE_MARK, LAZER_COOKIE_TITLE, LAZER_COOKIE_VERSION, idleSpectrum } from './LazerCookie';
export { LazerDebugSmoke } from './LazerDebugSmoke';
export {
  filledTriangleAimCount,
  LAZER_FILLED_MAX,
  LAZER_OUTLINE_FADE_MS,
  LAZER_OUTLINE_MAX,
  LAZER_OUTLINE_SPAWN_LAZER_MS,
  LAZER_OUTLINE_SPAWN_MS,
  LAZER_TRIANGLE_COLOUR_DARK,
  LAZER_TRIANGLE_COLOUR_LIGHT,
  LAZER_TRIANGLE_FIELD_BG,
  LAZER_TRIANGLE_SCALE,
  LAZER_TRIANGLE_SIZE,
  TriangleField,
} from './TriangleField';
export {
  applyLazerChrome,
  beatPeriodSeconds,
  LAZER_BACK,
  LAZER_BACK_FOOTER,
  LAZER_BAR_GRAY,
  LAZER_BOUNCE_COMPRESSION,
  LAZER_BOUNCE_ROTATION_DEG,
  LAZER_BROWSE,
  LAZER_COOKIE_PULSE_AMP,
  LAZER_CSS_VARS,
  LAZER_DURATION,
  LAZER_EASE_IN_OUT_SINE,
  LAZER_EASE_IN_SINE,
  LAZER_EASE_OUT_EXPO,
  LAZER_EASE_OUT_QUINT,
  LAZER_EDIT,
  LAZER_EXIT,
  LAZER_GREEN,
  LAZER_HOVER_SCALE,
  LAZER_HOVER_WIDTH_SPRING,
  LAZER_COOKIE_SLOT_PX,
  LAZER_MENU_BUTTON_WIDTH_PX,
  LAZER_MENU_LEAD_WIDTH_PX,
  LAZER_MENU_SETTINGS_WIDTH_PX,
  LAZER_MENU_OVERLAP_PX,

  lazerCompactCookieX,
  LAZER_MENU_WEDGE,
  LAZER_OVERLAY_BG_ALPHA,
  LAZER_PINK,
  LAZER_PINK_LIGHT,
  LAZER_PLAY,
  LAZER_QUIT,
  LAZER_SETTINGS,
  LAZER_SHEAR_DEG,
  LAZER_UNSHEAR_DEG,
  LAZER_YELLOW,
  LAZER_YELLOW_DARK,
  lazerTransition,
  resolveLazerChrome,
  useLazerReducedMotion,
} from './motion';
export { Shear } from './Shear';
export { MenuButton } from './MenuButton';
export type { MenuButtonProps, MenuButtonState } from './MenuButton';
export { ButtonSystem } from './ButtonSystem';
export type { ButtonSystemProps, ButtonSystemPhase } from './ButtonSystem';
export { ComingSoonNotificationStack, useComingSoonToasts } from './ComingSoonNotifications';
export type { LazerToastNotice } from './ComingSoonNotifications';
export { LazerToolbar, ToolbarTooltip } from './LazerToolbar';
export type { LazerToolbarProps, ToolbarTooltipProps, LazerTooltipData } from './LazerToolbar';
export { SongSelectFooter } from './SongSelectFooter';
export type { SongSelectFooterProps } from './SongSelectFooter';
export { SongSelectCarousel } from './SongSelectCarousel';
export type { SongSelectCarouselProps, CarouselSongGroup } from './SongSelectCarousel';
export { SongSelectLeftPanel, computeBpmSummary } from './SongSelectLeftPanel';
export type { SongSelectLeftPanelProps } from './SongSelectLeftPanel';
