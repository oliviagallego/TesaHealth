## Step 1 — Landing Requirements (Mockups + ER Diagram)

### What

In this step, I describe what my system will do from the user’s point of view, based on my mockups and the ER diagram.  
It helps me understand what pages exist, what each user can do, and how the data will be organized later in the database.

There are three main roles in the system: **Patient**, **Clinician**, and **Admin**.  
Each of them has different screens and actions.


### How

#### 1. Access to the main page (Login and Registration)

When someone enters the main page, they first see the **login and registration screen**.

- If the person is new, they can **register** by selecting “Who are you?”.  
  They must choose their role (Patient / Clinician / Admin) and **accept the privacy policy** before continuing.

- If they already have an account, they can **log in directly** by writing their username and password.  
  I will also add a small dropdown menu so the user can select which profile they want to enter (Patient, Clinician, or Admin).


#### 2. Patient profile and actions

When the user enters as a **Patient**, they will see four main options:

1. **Call emergency services**  
   - A direct button that connects them with emergency help.

2. **See previous medical consultations**  
   - The patient can see all their past cases.
   - They can click one to view details and **download a PDF** with the diagnosis.

3. **Edit profile**  
   - Here the patient fills in personal and health information:  
     - Gender (W / M)  
     - Pregnancy (Yes / No)  
     - Allergies (if yes, specify)  
     - Chronic diseases (if yes, specify which)  
     - Surgeries (if yes, specify which)  
     - Medication (if yes, specify which)  
     - Smoking habits (smokes / used to / don't want to answer)  
     - High blood pressure (yes / no / don't know)  
     - Diabetes (yes / no / don't know)

4. **Make a diagnosis**  
   - The patient selects one or more **symptoms**.  
   - For each symptom, the system will ask:
     - Where it is located  
     - If the patient has fever  
     - The **intensity** of the symptom (0–10 scale)  
     - The **date it started**  
     - And some **extra questions** related to that symptom.  
   - If any symptom is considered serious, the system will **send the case directly to a clinician**.  
   - If not, the system will create an **AI-based consensus**.  
   - At the end, the patient will see the result and have the option to **download a PDF** with the final report.


#### 3. Clinician profile and actions

When a user enters as a **Clinician**, they first need to provide professional information.

- They must upload their **medical documents and evidence**.  
  After sending this data, they must **wait for authorization** from an Admin before they can access the rest of the functions.

Once verified, they have three main options:

1. **Edit profile**  
   - Update or correct their professional information.

2. **Perform a diagnosis**  
   - The system shows a medical case (in a “MIR-style” question format).  
   - The clinician reads the vignette and chooses one of the possible answers (A, B, C, D, or Blank).  
   - Then, they also select the **urgency level** (for example: Seek now / 24–48h / ≤72h / Self-care).  
   - Finally, they can write a **short explanation or solution**.

3. **View their history of answers**  
   - They can see all the cases they have answered, and check which ones were correct or incorrect based on the final consensus.


#### 4. Admin profile and actions

To enter as an **Admin**, the person must first register and then receive authorization.

Once inside, the Admin has three options:

1. **Edit profile**  
   - Modify or update their personal data.

2. **Verify accounts**  
   - Review the clinician accounts and check if the documents and evidence are correct.
   - Approve or deny the verification: of other Admins or Clinicians
   - Note: Admins have no access to patient medical documentation here, in line with confidentiality and the GDPR data minimisation principle.

3. **View cases**  
   - Access the list of patient cases: shows caseId, date, status, and a pseudonymised patient ID (not the real name).

   - Case detail (redacted, no personal data): shows time of creation and an anonymised patient summary (sex, age range, pregnancy yes/no, allergies yes/no, chronic conditions yes/no, hypertension yes/no, diabetes yes/no, smoking yes/no).

   - Clinical context (structured, not free text): shows a concise medical background summary and symptom information.

   - Final consensus: shows the final label, final urgency, and a short recommended next step.

   - Contributors: shows the list of clinician IDs who answered the case, with timestamps (no clinician notes).

   - Privacy note: no names, surnames, emails, addresses, phone numbers, free-text notes, or PDFs are not shown here; this follows confidentiality and the GDPR data minimisation principle.


### Why

I do this step to connect the **user interface** with the **data model**.  
By describing all the screens and actions, I can later design the correct routes and endpoints in the backend.  
It also helps me make sure that every role (Patient, Clinician, Admin) has its own clear and logical flow.

This step makes my work organized:  
- the mockups show the visual design,  
- the ER diagram defines the data,  
- and this document connects both with real actions that will later become API endpoints.

It is my way of turning ideas into a concrete structure before writing any code.
