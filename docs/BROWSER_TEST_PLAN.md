# Browser test plan: Household Finance

You are testing a local web app in Chrome. Work through the sections in order, because later ones depend on data created earlier. For every step, compare what you see with **Expected**. Write down each failure with the step number, what you did, what you saw, and a screenshot. Don't fix code; only report.

## 0. Environment

| | |
|---|---|
| App (frontend) | <http://localhost:5174> |
| API | <http://localhost:5055/api> (health: `/api/health` → `{"ok":true}`) |
| Database | `finance_test`, a throwaway test database. Never point the app at `finance_dev` or `finance_prod` for testing. |
| Email | SMTP is **not** configured, so invitation emails are not sent. The app shows the invite link on screen instead, and the API prints it to its log. |

If the servers are not running, start them from the repo root (`finance-tracker/`) in two terminals:

```powershell
# API against the test database
cd server; $env:MONGODB_DB="finance_test"; $env:PORT="5055"; $env:CLIENT_ORIGIN="http://localhost:5174"; npx tsx src/index.ts
# Frontend
cd client; $env:VITE_API_BASE_URL="http://localhost:5055/api"; npx vite --port 5174 --strictPort
```

**Test accounts:** only use made-up `@example.com` addresses and passwords you create for this test, for example `owner+<random>@example.com` and `partner+<random>@example.com`. Use a fresh random suffix on each run, because an email can only register once. Never use real email addresses or real passwords.

The month picker in the header drives every page. Unless a step says otherwise, stay on the **current month**.

---

## 1. Registration (couple) and partner invitation

1. Open `/register`.
   **Expected:** The **Register** tab is selected. The two cards "Just me" and "A couple" are shown, with "A couple" selected. There is a purple "Your partner" box.
2. Click **Just me**.
   **Expected:** The partner box and the "You are the" dropdown disappear. Click **A couple** again: they come back.
3. Submit with a 5-character password.
   **Expected:** The browser or the server blocks it ("at least 8 characters").
4. Fill in your name "Owner", relationship Husband, email `owner+<rnd>@example.com`, an 8+ character password, partner name "Partner", relationship Wife, partner email `partner+<rnd>@example.com`. Click **Create account**.
   **Expected:** You land on **Set up your workspace** (4 steps). A purple notice says email isn't configured and shows an invitation link (`http://localhost:5174/invite/<token>`). **Copy this link** and keep it for section 2.
5. In step 1 (Workspace):
   **Expected:** Two member cards. Partner's card shows an amber "Invitation pending · partner+…" badge. **Relationship** is a dropdown (Husband/Wife/Partner/Self/Other), not a text box.
6. Step 2 (Income): add a source for each person.
   **Expected:** **Source** is a dropdown (Salary, Bonus, Allowance, …). Set Owner Salary 11500, pay day 28. Set Partner Salary 9000, pay day 28.
7. Step 3 (Commitments): add
   - "Apartment rent", category Rent, Common, 5500, due day 1
   - "Car EMI", category Car Loan, Personal (Owner), 1200, due day 15, end month 6 months ahead

   **Expected:** **Category** is a dropdown that includes Mobile, Car Loan, Credit Card and Custom…. A **Payment reminder** dropdown is present and defaults to "3 days before". A hint says it repeats every month without an end month.
8. Step 4 (Review): **Confirm & start**.
   **Expected:** The dashboard opens. The sidebar shows Dashboard, Expenses, Income, Commitments, Accounts, Wealth, Goals, Settings.
9. Try registering again with the same owner email (sign out first).
   **Expected:** Error "An account with … already exists".

## 2. Partner accepts the invitation

1. Sign out. Paste the invite link from 1.4 into the address bar.
   **Expected:** The "You're invited" page shows "Owner invited you to Owner & Partner". The email field is disabled and shows the partner email, and the name field is pre-filled with "Partner".
2. Before accepting, go to `/` and try to sign in as the partner with any password.
   **Expected:** "Invalid email or password". Invited users can't sign in yet.
3. Open the invite link again, set a password and click **Join workspace**.
   **Expected:** You land on the same workspace's dashboard (setup is already done).
4. Open the same invite link again in a new tab while signed out.
   **Expected:** "This invitation was already accepted. Sign in instead."
5. Sign in with an **uppercase** version of the partner's email.
   **Expected:** It works, because email matching ignores case.

## 3. Dashboard and settle-up explanation

Sign in as **Owner**.

1. **Expected:** Scope tabs show "Owner (me) · Partner · Common". The month's expected income is visible (Income received 0 of 11,500 for Owner).
2. In "Commitments this month", click **Mark paid** on Apartment rent.
   **Expected:** A dialog opens with Amount 5,500, a date in this month, and a **Paid by** dropdown with a hint about who owes whom. Choose **Owner** and record it.
3. **Expected:** Rent shows a green check. Under the cards, a line reads "**Partner owes Owner AED 2,750.00 for common expenses this month.**"
4. Click **Why?** on that line.
   **Expected:** A table shows Paid / Half share / Difference per person (Owner: 5,500 / 2,750 / +2,750, Partner: 0 / 2,750 / −2,750), plus a sentence explaining the cause.
5. Switch scope to **Common**.
   **Expected:** The title is "Common dashboard" and Common expenses = 5,500.

## 4. Commitments: repeat, end, delete, reminders

1. Open **Commitments**.
   **Expected:** The subtitle says commitments repeat every month. Rent shows "Paid". Each row shows a bell with "3d before". The period column shows "→ every month" or the end month.
2. Click the header month picker **›** (next month).
   **Expected:** Rent and Car EMI still appear, now unpaid (they carry over automatically). Go back to the current month.
3. Add a new commitment "Mobile EMI", category Mobile, Personal (Partner), 250, due day = **today's day of month + 2**, reminder "3 days before".
   **Expected:** It appears in Active.
4. Click the **bell** in the header.
   **Expected:** The badge count is at least 1. The list includes "Mobile EMI · Due <date> (in 2 days)", showing only the owner's own bills plus common bills. Mobile EMI is Partner's personal bill, so it should **not** appear for Owner. Sign in as Partner and it should appear there. Unpaid bills with a due day earlier this month show "Overdue" in red.
5. Edit Mobile EMI and set **Payment reminder → No reminder**.
   **Expected:** The row shows a crossed-out bell, and it disappears from the bell list.
6. Click the trash icon on Mobile EMI.
   **Expected:** The confirm dialog explains that delete removes it from every month and that **End** keeps history. Click Delete: the row is gone.
7. Mark Car EMI paid (Paid by Owner), then delete it.
   **Expected:** It is gone from Commitments, but **Expenses** still lists the "Car EMI" payment, with no link icon.
8. On Rent, click the end icon (calendar with X) and set the last month to the current month.
   **Expected:** In next month, Rent shows "n/a" or moves to the Ended tab after this month. Reactivate it afterwards.

## 5. Income: recurring income (moved out of Settings)

1. Open **Settings**.
   **Expected:** There is **no** "Monthly income sources" panel. The panels are Members, Lists, and Backup & restore.
2. Open **Income** and click **Recurring income**.
   **Expected:** A dialog lists both members with dropdown sources, amount and pay day. Add Owner "Bonus" 1000, keep "Also update <month>" checked, and save.
   **Expected:** A Bonus row (expected) appears for this month. Salary rows that are already received are untouched.
3. Click **Received** on Owner's Salary.
   **Expected:** The status badge reads "Received" (label comes from the lookup table).

## 6. Accounts (AED / INR tabs, banks, balances)

1. Open **Accounts**.
   **Expected:** Tabs "AED · INR · Transfers", group chips (All, Savings & cash, Deposits, Investments, Loans & cards), and an empty state.
2. On the **AED** tab, click **Add AED accounts**.
   **Expected:** A wide dialog with a table row: Bank dropdown (AED banks such as Emirates NBD, RAKBANK, Emirates Islamic …), Type, Name, Owner (incl. "Joint"), Last 4, Balance, Invested (shown only for investment types).
3. Click **Add another account** twice and fill in:
   - ENBD · Savings · Owner · 12000
   - RAKBANK · Savings · Partner · 8000
   - Emirates Islamic · Fixed deposit · Joint · 20000

   Click the **+** next to a bank dropdown.
   **Expected:** An "Add a bank" dialog opens. Add "Wio Bank" (currency AED), and it is then selected in that row. Save all.
   **Expected:** Three or four accounts are listed. The footer shows "Net AED" with the total.
4. Switch to **INR** and add:
   - SBI · Savings · Joint · 235000
   - Federal Bank · Savings · Owner · 50000
   - Groww · SIP · Owner · balance 120000, invested 100000
   - SBI · Loan · Owner · 470000

   **Expected:** Banks in the dropdown are Indian (SBI, Federal Bank, HDFC, ICICI, Zerodha, Groww …). Numbers use Indian grouping (2,35,000.00). The SIP row shows Gain +20,000.00. The footer reads net = assets − loans (a negative net is in red).
5. Go to **next month** in the header.
   **Expected:** An amber banner says the accounts are not updated for that month and the last balance is carried forward. Values are greyed.
6. Click **Update balances** (INR, next month).
   **Expected:** Each account shows last month's value and an input whose placeholder is the carried-forward value. Enter SBI 240000 and the loan 460000, and leave the others blank. Save.
   **Expected:** Change column: SBI **+5,000**, loan **+10,000** (paying a loan down counts as positive). The others show no change.
7. Return to the current month.

## 7. Transfers

1. Click **Transfer**. From "ENBD (AED)" to "SBI (INR)", Sent 2000, Received 47000, Fee 10.
   **Expected:** A "Received (INR)" field appears only because the currencies differ. The hint shows "Rate: 1 AED = 23.5000 INR". After saving, the **Transfers** tab opens with the row and its rate.
2. Try a transfer with the same account for From and To.
   **Expected:** Error "Choose two different accounts".
3. Archive the transfer (box icon), then record it again for the next sections.

## 8. Wealth dashboard

1. Open **Wealth**.
   **Expected:**
   - Tiles: "Total net worth (in AED)", "AED net worth (UAE)", "INR net worth (India)". Each shows Previous and a change line, and INR also shows "≈ AED …".
   - An exchange rate editor "1 AED = [23.5] INR". Change it to 24 and click **Save rate**: the total tile changes.
   - A "Where the money is" table with previous- and current-month columns per currency, rows for Savings & cash, Deposits, Investments, Loans & cards (shown negative in red), an investment gain row, and a Net row.
   - A "Net worth · last 12 months" line chart (hover shows a tooltip with month and value) and a "Sent abroad each month" bar chart with this month's 2,000 AED bar, plus a summary line "1 transfer AED → INR … avg rate 23.5".
2. Switch scope tabs Household / Owner (me) / Partner / Joint.
   **Expected:** Totals change. Partner shows only RAKBANK. Joint shows only joint accounts.
3. Resize the window to phone width (about 390px).
   **Expected:** No horizontal page scroll (tables scroll inside their cards). The bottom nav scrolls sideways and shows all 8 items.

## 9. Settings: members, invitations, lists

1. **Members:** both are listed as Active, with emails.
   **Expected:** No invite form is shown (the workspace already has 2 active members).
2. **Lists:** click each chip (categories, banks, account types, income sources, relationships, currencies).
   **Expected:** Built-in values are listed, including "Wio Bank" added earlier. Add category "Pets": it appears with a hide (eye) toggle, and it is now selectable in **Expenses → Add expense → Category**. Hide it: it disappears from the dropdown.
3. Add account type "Crypto", Counts as Investment. In Accounts, a new account of type Crypto shows an Invested field.

## 10. Personal workspace and invite later

1. Sign out and register with **Just me** (new email `solo+<rnd>@example.com`).
   **Expected:** Setup shows one member. Commitment and expense forms have **no** Personal/Common toggle and no "Paid by". The dashboard has no scope tabs and no settle-up line. The sidebar subtitle reads "Personal finance".
2. Finish setup, then go to **Settings → Members** and invite a partner (name, email, relationship).
   **Expected:** A link box appears ("Email is not configured … send this link"), with a working **Copy** button. The member list shows the partner with an amber "Invitation pending" badge, and a pending-invite row offers **Resend** (clicking it gives a new link). The workspace now behaves as a couple (scope tabs appear after a refresh).

## 11. Security and isolation

1. While signed in as the solo user, open the Accounts, Expenses and Wealth pages.
   **Expected:** None of Owner/Partner's data is visible. Lists show "Pets" only if it was added in this workspace (it should not be).
2. Sign out, then open `/accounts` directly.
   **Expected:** The sign-in page.
3. Enter a wrong password 11 times quickly for one email.
   **Expected:** "Too many attempts. Try again in a few minutes."

## 12. Backup round trip

1. As Owner: **Settings → Export backup**.
   **Expected:** A JSON file downloads. When opened, it has `"schemaVersion": 2` and `data.accounts`, `data.accountBalances`, `data.transfers` and `data.lookups` (custom values only), and no `passwordHash`.
2. Add a throwaway expense, then **Restore from file…** with that backup and type `RESTORE`.
   **Expected:** It reports a valid backup with counts. After the restore the throwaway expense is gone, and accounts, balances and transfers are still there. A "pre-restore" server snapshot is listed.

---

## Report format

```
## Result: X passed / Y failed / Z blocked
| Step | Status | Notes (what you saw vs expected) |
|------|--------|----------------------------------|
| 1.4  | FAIL   | No invite link shown; screenshot … |
```

Also list any console errors (DevTools → Console) and any layout problems at phone width.
