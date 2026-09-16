import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { PRICE_STANDARD, PRICE_CENOMAR, PRICE_ID } from "@/lib/landing";
import { peso } from "@/lib/money";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Terms and Conditions · DocuAssist PH",
  description:
    "The terms of the DocuAssist PH document request service: what we do, what it costs, delivery, and cancellation.",
};

/**
 * Written from what this system actually does — the prices in lib/landing.ts,
 * the no-cancellation rule the tracking page already shows, the three delivery
 * attempts the orders board counts. Nothing here is aspirational, because a
 * term the business does not actually follow is worse than no term at all.
 *
 * NOT drafted by a lawyer. It is an honest description of the service, which
 * is the right starting point, but it should be reviewed by counsel before it
 * is relied on in a dispute.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" updated="16 September 2026">
      <h2>Who we are and what we do</h2>
      <p>
        DocuAssist PH is a document assistance service. We file requests for
        civil registry documents with the Philippine Statistics Authority (PSA)
        on your behalf, and for government IDs with the relevant agency, and we
        have the result delivered to your address.
      </p>
      <p>
        We are <strong>not</strong> the PSA, and we are not a government agency
        or connected to one. We do not issue documents, and we cannot change
        what a record says. We are a private service you are paying to do the
        queuing, the filing and the follow-up for you.
      </p>

      <h2>Your request must be yours to make</h2>
      <p>
        By placing an order you confirm that every detail you give us is true,
        and that you are the person named on the document or are authorised by
        them to request it.
      </p>
      <p>
        Requesting a document with false details, or for someone whose
        authority you do not have, is fraud. Obtaining another person&apos;s
        civil registry record without their authority is also a violation of
        the Data Privacy Act of 2012 (Republic Act 10173). Presenting an ID to
        our courier to claim a document that is not yours is a criminal offence.
        We will cooperate with any lawful investigation into such a request.
      </p>

      <h2>Prices</h2>
      <p>
        Ordering on this website is paid before we file anything:
        {" "}{peso(PRICE_STANDARD)} for a PSA Birth, Marriage or Death
        Certificate, {peso(PRICE_CENOMAR)} for a CENOMAR, and{" "}
        {peso(PRICE_ID)} for a TIN ID or PhilHealth ID. These prices are
        all-in — the PSA fee, our service, and nationwide delivery.
      </p>
      <p>
        Orders arranged through our Facebook page may instead be cash on
        delivery, at the price quoted to you in that conversation. Cash on
        delivery costs more, because the fee is paid to the agency up front and
        is only recovered if the parcel is actually accepted.
      </p>
      <p>
        The price shown on your order screen is the price that applies. If an
        agency fee changes after you have ordered, we absorb it — we will not
        come back to you for more.
      </p>

      <h2>How long it takes</h2>
      <p>
        The estimate shown when you order — usually around three weeks
        including delivery — is an estimate, not a guarantee. Processing time
        is the agency&apos;s, not ours. Records that are damaged, misfiled, or
        held for verification at the agency take longer, and when that happens
        we will tell you on your tracking page rather than let you wonder.
      </p>

      <h2>Delivery</h2>
      <p>
        We deliver nationwide by courier. Please give a complete address and a
        mobile number that is answered — the courier will call or text before
        delivery.
      </p>
      <ul>
        <li>
          After three unsuccessful delivery attempts, the parcel is returned to
          us.
        </li>
        <li>
          A returned parcel can be sent out again once you have confirmed the
          correct address with us. A re-delivery may carry an additional
          shipping fee, which we will tell you before we send it.
        </li>
        <li>
          We are not responsible for delay or loss caused by an incomplete or
          incorrect address you gave us.
        </li>
      </ul>

      <h2>Cancellation and refunds</h2>
      <p>
        <strong>
          Once your request has been filed with the agency it cannot be
          cancelled or changed.
        </strong>{" "}
        The fee is paid at that point and is not recoverable by us, which is why
        we ask you to check every spelling and date on the review screen before
        you pay.
      </p>
      <p>
        If you contact us before we have filed the request, we will cancel and
        refund you in full.
      </p>
      <p>
        If the agency has no record matching the details you gave, that is a
        completed search and not a failure of the service — the fee covers the
        search. We will send you what the agency issues, which for a search
        with no result is a negative certification.
      </p>
      <p>
        If we lose your document, deliver the wrong one, or make an error in
        filing that is ours rather than yours, we will re-file at our own cost.
      </p>

      <h2>Your tracking link</h2>
      <p>
        Every order gets a tracking link. It needs no password, so treat it as
        private — anyone with the link can see the status of your order and the
        first name it was placed under. If you lose it, you can find your orders
        again by the mobile number you ordered with.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        The terms that apply to your order are the ones published on this page
        on the day you placed it. We will not apply a later change backwards.
      </p>

      <h2>Contact</h2>
      <p>
        Message us on our Facebook page and a real person will reply. If
        something has gone wrong with your order, tell us before you dispute the
        payment — we would much rather fix it.
      </p>
    </LegalPage>
  );
}
