/**
 * Phone-only top bar: brand mark on the left, language toggle on the right.
 *
 * Hidden on desktop (CSS), where the left rail + the bell/language Topbar do the
 * job. On phones the left rail is replaced by a bottom nav (see MobileNav), so
 * the logo and language control move up here.
 */
import { useLang } from '../i18n/index.jsx';
import logo from '../images/logo.png';

export default function MobileTopbar() {
  const { lang, toggle } = useLang();
  return (
    <header className="mobile-topbar">
      <span className="mtop-brand">
        <img className="mtop-logo" src={logo} alt="নাগরিক সেতু — Nagorik Setu" draggable="false" />
      </span>
      <button type="button" className="mtop-lang" onClick={toggle}>
        {lang === 'bn' ? 'English' : 'বাংলা'}
      </button>
    </header>
  );
}
