"use client";

/**
 * Below-the-fold pieces of the front page, loaded only in the browser so the
 * hero never pulls in the world map or the survey engine on a cheap phone.
 */
import dynamic from "next/dynamic";

const Placeholder = ({ h }: { h: number }) => <div aria-hidden className="w-full animate-pulse rounded-2xl bg-paper-deep" style={{ height: h }} />;

export const LazySurveyDemo = dynamic(() => import("@/components/survey/SurveyDemo"), {
  ssr: false,
  loading: () => <Placeholder h={660} />,
});

export const LazyLiveSnapshot = dynamic(() => import("@/components/site/LiveSnapshot"), {
  ssr: false,
  loading: () => <Placeholder h={420} />,
});
