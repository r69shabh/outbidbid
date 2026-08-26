import re

with open('/Users/rishabh/pgming/outbid/public/index.html', 'r') as f:
    html = f.read()

modal_css = """
  /* ── MODAL ── */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,.65);
    display: none; align-items: center; justify-content: center;
    padding: 20px;
    backdrop-filter: blur(4px);
  }
  .modal-overlay.open { display: flex; }
  .modal-window {
    width: 100%; max-width: 420px;
    background: var(--card);
    border-radius: 24px;
    padding: 32px 24px 24px;
    border: 2px solid var(--line);
    position: relative;
  }
  .modal-close {
    position: absolute; top: 16px; right: 16px;
    background: none; border: none; font-size: 24px; color: var(--text-faint); cursor: pointer;
  }
  .modal-crown { font-size: 48px; text-align: center; margin-bottom: 8px; }
  .modal-title { font-size: 22px; font-weight: 900; text-align: center; margin-bottom: 4px; }
  .modal-sub { font-size: 14px; font-weight: 700; color: var(--text-sub); text-align: center; margin-bottom: 24px; }
  .form-group { margin-bottom: 14px; }
  .form-label { font-size: 12px; font-weight: 800; color: var(--text-sub); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 6px; display: block; }
  .form-input {
    width: 100%; background: var(--bg); border: 2px solid var(--line);
    border-radius: 12px; padding: 12px 14px; font-size: 15px; font-weight: 700;
    color: var(--text); outline: none; font-family: var(--font);
  }
  .form-input:focus { border-color: var(--blue); }
  .form-input::placeholder { color: var(--text-faint); }
  .modal-price-row {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--gold-light); border: 2px solid var(--gold);
    border-radius: 14px; padding: 14px 16px; margin: 20px 0 16px;
  }
  .modal-price-label { font-size: 14px; font-weight: 800; color: var(--gold-dark); }
  .modal-price-val { font-size: 28px; font-weight: 900; color: var(--gold); }
  .modal-err { color: var(--red); font-size: 13px; font-weight: 800; text-align: center; min-height: 18px; margin-bottom: 10px; }
  .btn-pay {
    width: 100%; background: var(--green); color: white; font-family: var(--font);
    font-size: 18px; font-weight: 900; padding: 15px; border-radius: 14px; border: none;
    cursor: pointer; box-shadow: 0 5px 0 var(--green-dark); transition: transform .1s, box-shadow .1s;
    text-transform: uppercase; letter-spacing: .5px;
  }
  .btn-pay:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--green-dark); }
  .btn-pay:disabled { opacity: .6; cursor: not-allowed; }

  /* ── TOAST ── */
  #toast {
    position: fixed; top: 70px; left: 50%; transform: translateX(-50%) translateY(-80px);
    background: var(--card); border: 2px solid var(--line); border-radius: 14px;
    padding: 12px 22px; font-size: 14px; font-weight: 800; color: var(--text);
    box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 300; opacity: 0;
    pointer-events: none; transition: all .3s cubic-bezier(.16,1,.3,1);
    display: flex; align-items: center; gap: 8px; white-space: nowrap;
    max-width: calc(100vw - 32px);
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  #toast.toast-success { border-color: var(--green); }
  #toast.toast-syncing { border-color: var(--gold); }
"""

if '/* ── MODAL ── */' not in html:
    html = html.replace('/* ── RESPONSIVE ── */', modal_css + '\n  /* ── RESPONSIVE ── */')

    with open('/Users/rishabh/pgming/outbid/public/index.html', 'w') as f:
        f.write(html)
    print("Injected modal CSS")
else:
    print("Modal CSS already exists?")
