import type { Metadata } from "next";

/**
 * Metadata that makes an organisation's survey installable as ITS OWN app:
 * its own manifest (opens straight to its survey, not the JFINDX home page)
 * and the iOS "Add to Home Screen" flags. Shared by /[org], /[org]/open and
 * /[org]/l/[link].
 */
export function surveyMetadata(org: string): Metadata {
  return {
    manifest: `/${org}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: org, statusBarStyle: "default" },
  };
}
