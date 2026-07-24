/**
 * Bangla is a first-class language here, not an afterthought (CLAUDE.md §3).
 *
 * The citizen app defaults to Bangla because its users are Gazipur residents,
 * many with limited English. The councilor dashboard defaults to English
 * because that is what municipal officers work in — both have a toggle.
 *
 * Deliberately a plain object rather than an i18n library: two languages, one
 * bundle, no plural rules needed, and nothing to configure in a 48-hour build.
 */
import { createContext, useContext, useMemo, useState } from 'react';

export const STRINGS = {
  bn: {
    // citizen app
    appName: 'নাগরিক সেতু',
    tagline: 'আপনার এলাকার সমস্যা জানান',
    describe: 'সমস্যাটি লিখুন',
    placeholder: 'যেমন: টঙ্গী বাজারের সামনে বিদ্যুতের তার ছিঁড়ে পড়ে আছে…',
    addPhoto: 'ছবি যোগ করুন',
    retakePhoto: 'ছবি বদলান',
    submit: 'রিপোর্ট পাঠান',
    submitting: 'পাঠানো হচ্ছে…',
    locating: 'অবস্থান নেওয়া হচ্ছে…',
    locationReady: 'অবস্থান পাওয়া গেছে',
    locationDenied: 'অবস্থান পাওয়া যায়নি — গাজীপুর ধরে নেওয়া হয়েছে',
    needSomething: 'অন্তত কিছু লিখুন অথবা একটি ছবি দিন',
    thanks: 'ধন্যবাদ! আপনার রিপোর্ট পাওয়া গেছে',
    analysing: 'Gemma 4 আপনার রিপোর্ট বিশ্লেষণ করছে…',
    analysingHint: 'এতে ১৫–২৫ সেকেন্ড লাগতে পারে',
    understood: 'যা বোঝা গেছে',
    category: 'ধরন',
    severity: 'জরুরি মাত্রা',
    department: 'দায়িত্বপ্রাপ্ত বিভাগ',
    location: 'স্থান',
    newReport: 'আরেকটি রিপোর্ট',
    noPhoto: 'ছবি ছাড়া',
    // shared
    dashboard: 'ড্যাশবোর্ড',
    report: 'রিপোর্ট',
    transparency: 'স্বচ্ছতা',
  },
  en: {
    appName: 'Nagorik Setu',
    tagline: 'Report a problem in your area',
    describe: 'Describe the problem',
    placeholder: 'e.g. A power line is down and sparking at Tongi Bazar…',
    addPhoto: 'Add a photo',
    retakePhoto: 'Change photo',
    submit: 'Send report',
    submitting: 'Sending…',
    locating: 'Getting your location…',
    locationReady: 'Location captured',
    locationDenied: 'Location unavailable — assuming Gazipur',
    needSomething: 'Please write something or attach a photo',
    thanks: 'Thank you! Your report was received',
    analysing: 'Gemma 4 is analysing your report…',
    analysingHint: 'This can take 15–25 seconds',
    understood: 'What we understood',
    category: 'Category',
    severity: 'Severity',
    department: 'Department',
    location: 'Location',
    newReport: 'Report something else',
    noPhoto: 'No photo',
    dashboard: 'Dashboard',
    report: 'Report',
    transparency: 'Transparency',
  },
};

/** Category labels — shown to citizens, so Bangla must read naturally. */
export const CATEGORY_LABELS = {
  bn: {
    infrastructure: 'অবকাঠামো',
    utility: 'সেবা',
    sanitation: 'পয়ঃনিষ্কাশন',
    hazard: 'বিপদ',
    water: 'পানি',
    waste: 'বর্জ্য',
    traffic: 'যানজট',
  },
  en: {
    infrastructure: 'Infrastructure',
    utility: 'Utility',
    sanitation: 'Sanitation',
    hazard: 'Hazard',
    water: 'Water',
    waste: 'Waste',
    traffic: 'Traffic',
  },
};

const LangContext = createContext(null);

export function LangProvider({ initial = 'bn', children }) {
  const [lang, setLang] = useState(initial);
  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggle: () => setLang((l) => (l === 'bn' ? 'en' : 'bn')),
      t: (key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key,
      category: (c) => CATEGORY_LABELS[lang]?.[c] ?? c,
    }),
    [lang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}
