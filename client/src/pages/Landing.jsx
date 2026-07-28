/**
 * The front door.
 *
 * A full-bleed crimson splash with the Nagorik Setu mark. It exists to do one
 * thing for a resident who is walking past a problem or standing in one: give
 * them a single, unmissable target that drops them straight into reporting. The
 * whole screen is the button.
 *
 * The logo asset is white-on-transparent (and carries the Bangla wordmark), so
 * it sits directly on the brand crimson field with no processing — crisp at any
 * size because the 1024px source is only ever downscaled.
 */
import { useNavigate } from 'react-router-dom';

import logo from '../images/logo.png';

export default function LandingPage() {
  const navigate = useNavigate();
  const go = () => navigate('/report');

  return (
    <div
      className="landing"
      role="button"
      tabIndex={0}
      aria-label="নাগরিক সেতু — রিপোর্ট করতে ট্যাপ করুন · Nagorik Setu — tap to report"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
    >
      <img
        className="landing-art"
        src={logo}
        alt="নাগরিক সেতু — Nagorik Setu"
        draggable="false"
      />

      <div className="landing-hint">
        <span className="bn">রিপোর্ট করতে যেকোনো জায়গায় ট্যাপ করুন</span>
        <span className="en">Tap anywhere to report</span>
      </div>
    </div>
  );
}
