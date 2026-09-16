import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Privacy Policy · DocuAssist PH",
  description:
    "What personal data DocuAssist PH collects, why, who sees it, and your rights under the Data Privacy Act of 2012.",
};

/**
 * Written from what this system actually stores and where.
 *
 * Every claim below is checkable against the code: the fields are the ones on
 * the order form, the receipt bucket really is private and read through
 * short-lived signed links, the tracking RPC really does return a whitelist.
 * A privacy policy describing a system that does not exist is the one kind
 * that is actively harmful, so this one describes this one.
 *
 * NOT drafted by a lawyer, and it is missing two things only the business can
 * supply: a registered address and a named Data Protection Officer with a
 * direct contact. Both are expected of a personal information controller under
 * RA 10173. Add them and have counsel read this before relying on it.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="16 September 2026">
      <h2>The short version</h2>
      <p>
        We ask for the least we can and use it only to get your document to
        you. We do not sell your data, we do not share it for advertising, and
        we do not post your documents anywhere.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your contact and delivery details</strong> — name, mobile
          number, Facebook name if you give one, and your full delivery address.
        </li>
        <li>
          <strong>The details of the document you are requesting</strong> —
          the name, date and place on the record, and parents&apos; names where
          the agency&apos;s form asks for them. For an ID application, the
          details that form requires.
        </li>
        <li>
          <strong>Proof of payment</strong>, if you upload a receipt
          screenshot.
        </li>
        <li>
          <strong>Basic technical information</strong> — your IP address is
          used to rate-limit the order form and the tracking search, so neither
          can be hammered by a script.
        </li>
      </ul>
      <p>
        Some of this is <em>sensitive personal information</em> under the Data
        Privacy Act — a civil registry record carries dates and places of birth,
        parentage, and marital status. We treat it that way.
      </p>

      <h2>Why we collect it, and on what basis</h2>
      <p>
        To file your request with the agency, to deliver the result, and to let
        you and our staff see where your order has reached. Our lawful basis is
        the consent you give on the order form, together with the necessity of
        processing it to perform the service you asked for.
      </p>

      <h2>Who sees it</h2>
      <ul>
        <li>
          <strong>Our staff</strong>, and only the ones whose account covers the
          documents on your order.
        </li>
        <li>
          <strong>The issuing agency</strong> — the PSA or the relevant ID
          agency — which needs the details to find your record.
        </li>
        <li>
          <strong>The courier</strong>, which is given your name, address and
          mobile number so it can deliver to you, and nothing about the contents.
        </li>
      </ul>
      <p>
        Nobody else. We do not sell personal data, and we do not pass it to
        advertisers or data brokers.
      </p>

      <h2>How it is held</h2>
      <p>
        Order data is held in a managed database with row-level access rules, so
        a staff account can only read the orders it is entitled to. Receipts and
        supporting documents go to private storage that is not publicly
        readable — staff open them through links that expire after five minutes,
        and there is no public URL for them.
      </p>
      <p>
        Your tracking page is deliberately thin. It shows your first name, the
        document type, the status and the delivery estimate — not your address,
        not your full details, and not the document itself.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep order records for as long as we may need them to answer a
        question about a past order or to meet a legal or tax obligation.
        Receipt images are deleted once the payment they evidence has been
        verified and the order completed. If you want your record removed
        sooner, ask us — see below.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Data Privacy Act of 2012 you have the right to be informed,
        to object, to access what we hold about you, to have it corrected, to
        have it erased or blocked, to damages, and to data portability. You may
        also complain to the National Privacy Commission.
      </p>
      <p>
        To exercise any of these, message our Facebook page with the mobile
        number you ordered with. We will act on it. Note that once a request has
        been filed with the agency we cannot withdraw it from their records —
        only from ours.
      </p>

      <h2>Cookies</h2>
      <p>
        The public pages set no advertising or analytics cookies. Staff signing
        in to the office system get a session cookie, which is what keeps them
        signed in and nothing more.
      </p>

      <h2>Children</h2>
      <p>
        This service is for adults. A parent or guardian may of course request
        their child&apos;s birth certificate — that is most of what we do — but
        the account and the consent are the adult&apos;s.
      </p>

      <h2>Contact</h2>
      <p>
        Message us on our Facebook page. If your question is about your data
        rather than your order, say so and it will be routed to the person
        responsible for data protection.
      </p>
    </LegalPage>
  );
}
