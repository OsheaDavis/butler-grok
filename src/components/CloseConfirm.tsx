import type { AppStore } from '../hooks/useAppStore';

export function CloseConfirm({ store }: { store: AppStore }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 420 }}>
        <h2>Close Butler Grok?</h2>
        <p className="muted">All tasks will stop if closed.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => store.setCloseConfirmOpen(false)}>
            Keep open
          </button>
          <button type="button" className="btn danger" onClick={() => void store.confirmQuit()}>
            Close app
          </button>
        </div>
      </div>
    </div>
  );
}
