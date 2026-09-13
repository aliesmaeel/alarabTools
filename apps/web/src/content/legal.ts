/**
 * Business details used by the privacy policy, terms of service, contact page and invoices.
 * Fill these in before launch; every field is plain text. Nothing here is secret.
 * Leave a field empty and the pages that need it show a "to be completed" note instead of failing.
 */
export const LEGAL = {
  /** Trading name shown on the site (the brand is alarabTools; this is the entity behind it). */
  businessName: "",
  /** Legal form and registration, e.g. "Sole proprietorship, CR 1010XXXXXX". */
  registration: "",
  /** Country and city the business is registered in, e.g. "Riyadh, Saudi Arabia". */
  location: "",
  /** Postal address for legal notices (optional). */
  address: "",
  /** Public contact address shown on the contact page. */
  contactEmail: "",
  /** Address for privacy requests (data deletion, questions); can equal contactEmail. */
  privacyEmail: "",
  /** Governing law and venue for the terms, e.g. "the laws of the Kingdom of Saudi Arabia". */
  governingLaw: "",
  /** VAT or tax number, if any (shown on developer API invoices). */
  taxId: "",
  /** Date the privacy policy and terms were last updated, ISO format. */
  updatedOn: "",
} as const;

export type LegalField = keyof typeof LEGAL;
export const legalReady = (): boolean => !!LEGAL.businessName && !!LEGAL.location && !!LEGAL.contactEmail;
