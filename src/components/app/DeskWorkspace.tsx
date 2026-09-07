import type { AppStore } from '../../hooks/useAppStore';
import type { TileLine } from '../HomeTile';
import { HomeTile } from '../HomeTile';
import { FloatPanel } from '../FloatPanel';
import { ButlerPanel } from '../ButlerPanel';
import {
  isProjectDisplayPanel,
  panelTitle,
  projectIdFromDisplayPanel,
  type HomeTileLayout,
  type StaticPanelId,
} from '../../lib/types';
import { renderBody } from './renderPanelBody';

const DEFAULT_FLOAT = { x: 40, y: 40, w: 440, h: 360 };

export function DeskWorkspace({
  store,
  tiles,
  tileLines,
  tileCounts,
  tileStatus,
}: {
  store: AppStore;
  tiles: HomeTileLayout[];
  tileLines: Record<StaticPanelId, TileLine[]>;
  tileCounts: Record<StaticPanelId, string>;
  tileStatus: Record<StaticPanelId, 'ok' | 'warn' | null>;
}) {
  return (
    <div className="workspace">
      <div className="desk">
        {tiles.map((t) => (
          <HomeTile
            key={t.id}
            id={t.id}
            x={t.x}
            y={t.y}
            lines={tileLines[t.id]}
            countLabel={tileCounts[t.id]}
            status={tileStatus[t.id]}
            onMove={store.moveHomeTile}
            onOpen={store.openPanel}
          />
        ))}
        {/* Absolute tiles don't expand the desk — spacer creates scroll room below chat */}
        <div
          className="desk-scroll-spacer"
          style={{
            top: 0,
            height:
              Math.max(
                400,
                ...tiles.map((t) => t.y + 222 + 48),
                0
              ) + 'px',
          }}
        />

        {store.openFloats.length ? (
          <div className="float-layer">
            {store.openFloats.map((id) => {
              const layout = store.settings.floatLayouts[id] || DEFAULT_FLOAT;
              const pname = isProjectDisplayPanel(id)
                ? store.data.projects.find((p) => p.id === projectIdFromDisplayPanel(id))
                    ?.name
                : null;
              return (
                <FloatPanel
                  key={id}
                  id={id}
                  title={panelTitle(id, pname)}
                  x={layout.x}
                  y={layout.y}
                  w={layout.w}
                  h={layout.h}
                  z={store.floatZ[id] || 10}
                  onFocus={() => store.focusPanel(id)}
                  onClose={() => store.closePanel(id)}
                  onChange={(next) => store.saveFloatLayout(id, next)}
                >
                  {renderBody(id, store)}
                </FloatPanel>
              );
            })}
          </div>
        ) : null}
      </div>

      <ButlerPanel
        speaking={store.speaking}
        thinking={store.chatBusy}
        chatBusy={store.chatBusy}
        pointingPanel={store.pointingPanel}
        lastEngagedAt={store.lastEngagedAt}
        welcomePulse={store.welcomePulse}
        userListening={store.userListening}
        micOn={store.settings.micOn}
        butlerVoiceOn={store.settings.butlerVoiceOn}
        onToggleMic={() => store.updateSettings({ micOn: !store.settings.micOn })}
        onToggleVoice={() =>
          store.updateSettings({ butlerVoiceOn: !store.settings.butlerVoiceOn })
        }
        onReplay={store.replayLast}
        onStopVoice={store.stopVoice}
      />
    </div>
  );
}
