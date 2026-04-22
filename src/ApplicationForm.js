import { useState } from 'react';
import { supabase } from './supabaseClient';
import logo from './kingdom-living-logo.jpg';

const sections = ['General Info', 'Recovery', 'Emergency Contacts', 'Legal History', 'Information Accuracy'];

const emptyMed = () => ({ name: '', dosage: '', intake: '', count: '', notes: '' });
const emptyTreatment = () => ({ name: '', level_of_care: '', contact_name: '', contact_phone: '', contact_email: '', was_referred: '', referral_date: '', discharge_date: '' });

const DRUG_OPTIONS = [
  'Heroin (Smack, H)',
  'Fentanyl',
  'Morphine',
  'Oxycodone (OxyContin, Percocet)',
  'Hydrocodone (Vicodin)',
  'Codeine',
  'Methadone',
  'Tramadol',
  'Buprenorphine (Suboxone, Subutex)',
  'Cocaine (Coke)',
  'Crack cocaine (Crack)',
  'Methamphetamine (Meth, Crystal)',
  'Amphetamine (Adderall)',
  'Methylphenidate (Ritalin, Concerta)',
  'MDMA (Ecstasy, Molly)',
  'Marijuana (Cannabis, Weed, Pot)',
  'Synthetic cannabinoids (Spice or K2)',
  'Alcohol',
  'Nicotine (Tobacco)',
  'LSD (Acid)',
  'Psilocybin (Magic Mushrooms)',
  'Mescaline (Peyote)',
  'Phencyclidine (PCP or Angel Dust)',
  'Salvia',
  'Ketamine (Special K)',
  'DXM (Dextromethorphan)',
  'GHB (Gamma-hydroxybutyrate)',
  'Rohypnol (Roofies)',
  'Diazepam (Valium)',
  'Alprazolam (Xanax)',
  'Lorazepam (Ativan)',
  'Clonazepam (Klonopin)',
  'Barbiturates',
  'Inhalants',
  'Bath salts (Synthetic cathinones)',
  'Kratom',
  'Flunitrazepam (Rohypnol)',
  'Chloral hydrate',
  'Methaqualone (Quaalude)',
  'DMT (Dimethyltryptamine)',
  'Ayahuasca',
  'Ibogaine',
  'Khat',
  'Mephedrone (Meow Meow)',
  'Methylone',
  'Benzylpiperazine (BZP)',
  'PMA/PMMA (Death)',
  'Xylazine',
  'Other',
];

function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [medications, setMedications] = useState([emptyMed()]);
  const [treatments, setTreatments] = useState([emptyTreatment()]);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', email: '',
    correspondence_contact: '', date_of_birth: '', ssn: '',
    has_ss_card: '', present_residence: '', program: '',
    lived_here_before: '', assigned_sex: '', ethnicity: '',
    current_situation: '', has_id: '', marital_status: '',
    on_disability: '', disability_concentrating: '',
    disability_walking: '', disability_dressing: '',
    able_to_work: '', agree_to_volunteer: '',
    allergy_info: '', doctor_info: '', employment_status: '',
    employer_name: '', substance_history: '', drug_of_choice: '',
    sober_date: '', oud_diagnosis: '',
    recovery_meetings: '', attended_treatment: '',
    takes_medication: '',
    emergency_contact: '', collateral_contacts: '',
    on_probation: '', on_parole: '', po_name: '', po_phone: '',
    criminal_history: '', sex_offender: '', sex_offense_details: '',
    form_completed_by: '', agree_to_rules: '', agree_to_levels: '',
    client_notes: '', signature: '',
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const updateMed = (i, field, value) => {
    const updated = [...medications];
    updated[i] = { ...updated[i], [field]: value };
    setMedications(updated);
  };

  const updateTreatment = (i, field, value) => {
    const updated = [...treatments];
    updated[i] = { ...updated[i], [field]: value };
    setTreatments(updated);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePhoto(file);
      setProfilePhotoPreview(URL.createObjectURL(file));
    }
  };

  const validate = () => {
    if (step === 0) {
      if (!form.first_name) return 'First Name is required.';
      if (!form.last_name) return 'Last Name is required.';
      if (!form.phone) return 'Phone Number is required.';
      if (!form.email) return 'Email is required.';
      if (!form.correspondence_contact) return 'Admission Correspondence Contact is required.';
      if (!form.date_of_birth) return 'Date of Birth is required.';
      if (!form.ssn) return 'Social Security Number is required.';
      if (!form.has_ss_card) return 'Please answer: Do you have a Social Security Card?';
      if (!form.present_residence) return 'Present Residence is required.';
      if (!form.program) return 'Please select a program.';
      if (!form.lived_here_before) return 'Please answer: Have you lived here before?';
      if (!form.assigned_sex) return 'Assigned Sex is required.';
      if (!form.ethnicity) return 'Ethnicity is required.';
      if (!form.current_situation) return 'Please select your current situation.';
      if (!form.has_id) return 'Please answer: Do you have an ID?';
      if (!form.marital_status) return 'Marital Status is required.';
      if (!form.on_disability) return 'Please answer: Are you on disability?';
      if (form.on_disability === 'Yes') {
        if (!form.disability_concentrating) return 'Please answer the concentrating question.';
        if (!form.disability_walking) return 'Please answer the walking question.';
        if (!form.disability_dressing) return 'Please answer the dressing question.';
        if (!form.able_to_work) return 'Please answer: Are you able to work?';
        if (form.able_to_work === 'No' && !form.agree_to_volunteer) return 'Please answer the volunteer requirement question.';
      }
      if (!form.employment_status) return 'Employment Status is required.';
    }
    if (step === 1) {
      if (!form.substance_history) return 'Please answer the substance history question.';
      if (!form.oud_diagnosis) return 'Please answer the OUD diagnosis question.';
      if (!form.recovery_meetings) return 'Please answer the recovery meetings question.';
      if (!form.attended_treatment) return 'Please answer the treatment question.';
      if (!form.takes_medication) return 'Please answer the medication question.';
    }
    if (step === 2) {
      if (!form.emergency_contact) return 'At least one Emergency Contact is required.';
    }
    if (step === 3) {
      if (!form.on_probation) return 'Please answer: Are you on Probation?';
      if (!form.on_parole) return 'Please answer: Are you on Parole?';
      if (!form.criminal_history) return 'Criminal History is required.';
      if (!form.sex_offender) return 'Please answer: Are you a Registered Sex Offender?';
    }
    if (step === 4) {
      if (!form.form_completed_by) return 'Please enter the name of the person completing this form.';
      if (!form.agree_to_rules) return 'Please confirm you have read and agree to the rules.';
      if (!form.agree_to_levels) return 'Please confirm you have read and agree to the KL Levels.';
      if (!form.signature) return 'Signature is required.';
    }
    return null;
  };

  const handleNext = () => {
    const error = validate();
    if (error) { alert(error); return; }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) { alert(error); return; }
    setLoading(true);

    const fullName = `${form.first_name} ${form.last_name}`;
    const uniqueId =
      form.first_name.slice(0, 2).toLowerCase() +
      form.last_name.slice(0, 2).toLowerCase() +
      (form.date_of_birth ? form.date_of_birth.replace(/-/g, '').slice(2) : '000000');

    let photoUrl = null;
    if (profilePhoto) {
      const fileExt = profilePhoto.name.split('.').pop();
      const fileName = `${uniqueId}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, profilePhoto);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }
    }

    const medDetails = form.takes_medication === 'Yes' ? JSON.stringify(medications) : null;
    const treatmentDetails = form.attended_treatment === 'Yes' ? JSON.stringify(treatments) : null;

    const { error: appError } = await supabase
      .from('applications')
      .insert([{
        ...form,
        full_name: fullName,
        status: 'pending',
        medication_details: medDetails,
        treatment_details: treatmentDetails,
        photo_url: photoUrl,
      }]);

    setLoading(false);
    if (appError) {
      alert('There was an error submitting. Please try again.');
      return;
    }

    setSubmitted(true);
  };

  if (submitted) return (
    <div style={s.container}>
      <div style={s.card}>
        <img src={logo} alt="Kingdom Living" style={s.logo} />
        <h2 style={s.successTitle}>Application Submitted!</h2>
        <p style={s.successText}>Thank you for applying to Kingdom Living. We will review your application and contact you via email with next steps.</p>
      </div>
    </div>
  );

  return (
    <div style={s.container}>
      <div style={s.card}>
        <img src={logo} alt="Kingdom Living" style={s.logo} />
        <h2 style={s.title}>KL Application</h2>

        <div style={s.steps}>
          {sections.map((sec, i) => (
            <div key={i} style={{ ...s.stepItem, color: i === step ? '#b22222' : i < step ? '#16a34a' : '#666' }}>
              <div style={{ ...s.stepDot, backgroundColor: i === step ? '#b22222' : i < step ? '#16a34a' : '#444' }} />
              <span style={s.stepLabel}>{sec}</span>
            </div>
          ))}
        </div>

        <div style={s.section}>
          {step === 0 && <>
            <h3 style={s.sectionTitle}>General Info</h3>

            <Row label="Profile Photo">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {profilePhotoPreview && <img src={profilePhotoPreview} alt="Preview" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #444' }} />}
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ color: '#aaa', fontSize: '13px' }} />
              </div>
            </Row>

            <Row label="First Name *"><Input value={form.first_name} onChange={v => set('first_name', v)} /></Row>
            <Row label="Last Name *"><Input value={form.last_name} onChange={v => set('last_name', v)} /></Row>
            <Row label="Phone Number *"><Input value={form.phone} onChange={v => set('phone', v)} /></Row>
            <Row label="Email *"><Input value={form.email} onChange={v => set('email', v)} type="email" /></Row>
            <Row label="Admission Correspondence Contact *">
              <p style={s.hint}>All application and admission updates are sent by email. If currently incarcerated or in treatment, provide the contact info for the person you'd like us to correspond with.</p>
              <Input value={form.correspondence_contact} onChange={v => set('correspondence_contact', v)} placeholder="Name & Email" />
            </Row>
            <Row label="Date of Birth *"><Input value={form.date_of_birth} onChange={v => set('date_of_birth', v)} type="date" /></Row>
            <Row label="Social Security Number *"><Input value={form.ssn} onChange={v => set('ssn', v)} placeholder="Enter number" /></Row>
            <Row label="Do you have a Social Security Card? *"><Select value={form.has_ss_card} onChange={v => set('has_ss_card', v)} options={['Yes', 'No']} /></Row>
            <Row label="Applicant Present Residence *"><Input value={form.present_residence} onChange={v => set('present_residence', v)} placeholder="Place of Residence" /></Row>
            <Row label="Which program are you applying for? *"><Select value={form.program} onChange={v => set('program', v)} options={['In-House Program', 'Live-Outs Program']} /></Row>
            <Row label="Have you ever lived in one of our houses before? *"><Select value={form.lived_here_before} onChange={v => set('lived_here_before', v)} options={['Yes', 'No']} /></Row>
            <Row label="Assigned Sex *"><Select value={form.assigned_sex} onChange={v => set('assigned_sex', v)} options={['Male', 'Female', 'No Response']} /></Row>
            <Row label="Ethnicity *"><Select value={form.ethnicity} onChange={v => set('ethnicity', v)} options={['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or More Races', 'No Response']} /></Row>
            <Row label="Check all that applies *"><Select value={form.current_situation} onChange={v => set('current_situation', v)} options={['Currently Incarcerated', 'Homeless', 'Housing Insecure', 'Currently staying at Inpatient Treatment', 'Currently being referred by Recovery Community Center']} /></Row>
            <Row label="Do you have an ID? *"><Select value={form.has_id} onChange={v => set('has_id', v)} options={['Yes', 'No']} /></Row>
            <Row label="Marital Status *"><Select value={form.marital_status} onChange={v => set('marital_status', v)} options={['Single', 'Married', 'Divorced', 'Widowed', 'Separated']} /></Row>
            <Row label="Are you on (or will be on) disability? *"><Select value={form.on_disability} onChange={v => set('on_disability', v)} options={['Yes', 'No']} /></Row>
            {form.on_disability === 'Yes' && <>
              <Row label="Serious difficulty concentrating, remembering, or making decisions? *"><Select value={form.disability_concentrating} onChange={v => set('disability_concentrating', v)} options={['Yes', 'No']} /></Row>
              <Row label="Serious difficulty walking or climbing stairs? *"><Select value={form.disability_walking} onChange={v => set('disability_walking', v)} options={['Yes', 'No']} /></Row>
              <Row label="Difficulty dressing or bathing? *"><Select value={form.disability_dressing} onChange={v => set('disability_dressing', v)} options={['Yes', 'No']} /></Row>
              <Row label="Are you able to work? *"><Select value={form.able_to_work} onChange={v => set('able_to_work', v)} options={['Yes', 'No']} /></Row>
              {form.able_to_work === 'No' && <>
                <Row label="If you are unable to work, you will be required to volunteer. Do you agree to this requirement? *">
                  <Select value={form.agree_to_volunteer} onChange={v => set('agree_to_volunteer', v)} options={['Yes', 'No']} />
                </Row>
              </>}
            </>}
            <Row label="Allergy Information"><Textarea value={form.allergy_info} onChange={v => set('allergy_info', v)} /></Row>
            <Row label="Doctor Name & Phone Number"><Textarea value={form.doctor_info} onChange={v => set('doctor_info', v)} /></Row>
            <Row label="Employment Status *"><Select value={form.employment_status} onChange={v => set('employment_status', v)} options={['Employed Full-Time', 'Employed Part-Time', 'Self-Employed', 'Unemployed', 'Unable to Work', 'NONE']} /></Row>
            {form.employment_status !== 'NONE' && form.employment_status !== 'Unemployed' && form.employment_status !== 'Unable to Work' && form.employment_status !== '' &&
              <Row label="Employer Name"><Input value={form.employer_name} onChange={v => set('employer_name', v)} placeholder="Name of Current Employer" /></Row>}
          </>}

          {step === 1 && <>
            <h3 style={s.sectionTitle}>Recovery</h3>
            <Row label="Do you have a past or current history of substance or alcohol misuse? *">
              <Select value={form.substance_history} onChange={v => set('substance_history', v)} options={['Yes', 'No']} />
            </Row>

            <Row label="Drug of Choice">
              <select
                value={form.drug_of_choice}
                onChange={e => set('drug_of_choice', e.target.value)}
                style={{ width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', color: form.drug_of_choice ? '#fff' : '#888', fontSize: '14px' }}
              >
                <option value="">Select primary drug of choice</option>
                {DRUG_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Row>

            <Row label="Sobriety / Recovery Date">
              <Input value={form.sober_date} onChange={v => set('sober_date', v)} type="date" />
            </Row>

            <Row label="Are you diagnosed with opiate use disorder (OUD)? *">
              <Select value={form.oud_diagnosis} onChange={v => set('oud_diagnosis', v)} options={['Yes', 'No']} />
            </Row>
            <Row label="What type of recovery meetings do you attend? *">
              <Select value={form.recovery_meetings} onChange={v => set('recovery_meetings', v)} options={['AA', 'NA', 'Both AA & NA', 'Smart Recovery', 'Other', 'None']} />
            </Row>

            <h3 style={s.sectionTitle}>Treatment</h3>
            <Row label="Have you ever attended addiction treatment, PHP, IOP, or lived in another recovery house program? *">
              <Select value={form.attended_treatment} onChange={v => set('attended_treatment', v)} options={['Yes', 'No']} />
            </Row>
            {form.attended_treatment === 'Yes' && <>
              <p style={{ ...s.hint, marginBottom: '12px' }}>Please provide details for each treatment program attended. Click "+ Add Treatment" to add more.</p>
              {treatments.map((t, i) => (
                <div key={i} style={s.treatmentBlock}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>Treatment {i + 1}</span>
                    {treatments.length > 1 && <button onClick={() => setTreatments(treatments.filter((_, idx) => idx !== i))} style={s.removeBtn}>Remove</button>}
                  </div>
                  <div style={s.grid2}>
                    <div><label style={s.fieldLabel}>Name</label><Input value={t.name} onChange={v => updateTreatment(i, 'name', v)} placeholder="Treatment center name" /></div>
                    <div><label style={s.fieldLabel}>Level of Care</label><Input value={t.level_of_care} onChange={v => updateTreatment(i, 'level_of_care', v)} placeholder="e.g. Inpatient, IOP" /></div>
                    <div><label style={s.fieldLabel}>Contact Name</label><Input value={t.contact_name} onChange={v => updateTreatment(i, 'contact_name', v)} /></div>
                    <div><label style={s.fieldLabel}>Contact Phone</label><Input value={t.contact_phone} onChange={v => updateTreatment(i, 'contact_phone', v)} /></div>
                    <div><label style={s.fieldLabel}>Contact Email</label><Input value={t.contact_email} onChange={v => updateTreatment(i, 'contact_email', v)} type="email" /></div>
                    <div><label style={s.fieldLabel}>Were you referred?</label><Select value={t.was_referred} onChange={v => updateTreatment(i, 'was_referred', v)} options={['Yes', 'No']} /></div>
                    <div><label style={s.fieldLabel}>Referral Date</label><Input value={t.referral_date} onChange={v => updateTreatment(i, 'referral_date', v)} type="date" /></div>
                    <div><label style={s.fieldLabel}>Discharge Date</label><Input value={t.discharge_date} onChange={v => updateTreatment(i, 'discharge_date', v)} type="date" /></div>
                  </div>
                </div>
              ))}
              <button onClick={() => setTreatments([...treatments, emptyTreatment()])} style={s.addBtn}>+ Add Treatment</button>
            </>}

            <h3 style={s.sectionTitle}>Medications</h3>
            <Row label="Do you take any prescription medication? *">
              <Select value={form.takes_medication} onChange={v => set('takes_medication', v)} options={['Yes', 'No']} />
            </Row>
            {form.takes_medication === 'Yes' && <>
              <p style={{ ...s.hint, marginBottom: '12px' }}>Please list all medications. Click "+ Add Medication" to add more.</p>
              {medications.map((med, i) => (
                <div key={i} style={s.medBlock}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>Medication {i + 1}</span>
                    {medications.length > 1 && <button onClick={() => setMedications(medications.filter((_, idx) => idx !== i))} style={s.removeBtn}>Remove</button>}
                  </div>
                  <div style={s.grid2}>
                    <div><label style={s.fieldLabel}>Name</label><Input value={med.name} onChange={v => updateMed(i, 'name', v)} placeholder="Medication name" /></div>
                    <div><label style={s.fieldLabel}>Dosage</label><Input value={med.dosage} onChange={v => updateMed(i, 'dosage', v)} placeholder="e.g. 10mg" /></div>
                    <div><label style={s.fieldLabel}>Intake (times per day)</label><Input value={med.intake} onChange={v => updateMed(i, 'intake', v)} placeholder="e.g. 2" /></div>
                    <div><label style={s.fieldLabel}>Count</label><Input value={med.count} onChange={v => updateMed(i, 'count', v)} placeholder="e.g. 90" /></div>
                    <div style={{ gridColumn: 'span 2' }}><label style={s.fieldLabel}>Notes</label><Input value={med.notes} onChange={v => updateMed(i, 'notes', v)} placeholder="e.g. As needed" /></div>
                  </div>
                </div>
              ))}
              <button onClick={() => setMedications([...medications, emptyMed()])} style={s.addBtn}>+ Add Medication</button>
            </>}
          </>}

          {step === 2 && <>
            <h3 style={s.sectionTitle}>Emergency Contacts</h3>
            <Row label="Emergency Contact (Name, Relationship, Phone) *"><Textarea value={form.emergency_contact} onChange={v => set('emergency_contact', v)} placeholder="Name, relationship, and phone number" /></Row>
            <Row label="Collateral Contacts">
              <p style={s.hint}>A collateral contact is someone outside the scope of your counselor or parole officer. This is the only individual outside of professionals that we are permitted to share limited information with regarding your application, waiting list or participation in the program. (May provide more than one)</p>
              <Textarea value={form.collateral_contacts} onChange={v => set('collateral_contacts', v)} />
            </Row>
          </>}

          {step === 3 && <>
            <h3 style={s.sectionTitle}>Legal Details</h3>
            <Row label="Are you on Probation? *"><Select value={form.on_probation} onChange={v => set('on_probation', v)} options={['Yes', 'No']} /></Row>
            <Row label="Are you on Parole? *"><Select value={form.on_parole} onChange={v => set('on_parole', v)} options={['Yes', 'No']} /></Row>
            {(form.on_probation === 'Yes' || form.on_parole === 'Yes') && <>
              <Row label="Probation / Parole Officer Name"><Input value={form.po_name} onChange={v => set('po_name', v)} /></Row>
              <Row label="Probation / Parole Officer Phone"><Input value={form.po_phone} onChange={v => set('po_phone', v)} /></Row>
            </>}
            <Row label="Criminal History (describe everything in last 5 years) *"><Textarea value={form.criminal_history} onChange={v => set('criminal_history', v)} /></Row>
            <Row label="Are you a Registered Sex Offender? *"><Select value={form.sex_offender} onChange={v => set('sex_offender', v)} options={['Yes', 'No']} /></Row>
            {form.sex_offender === 'Yes' && <Row label="Sex Offense Details"><Textarea value={form.sex_offense_details} onChange={v => set('sex_offense_details', v)} /></Row>}
          </>}

          {step === 4 && <>
            <h3 style={s.sectionTitle}>Information Accuracy</h3>
            <Row label="Name of person filling out this form *"><Input value={form.form_completed_by} onChange={v => set('form_completed_by', v)} placeholder="Enter Name" /></Row>
            <Row label="I have read & agree to the rules *"><Select value={form.agree_to_rules} onChange={v => set('agree_to_rules', v)} options={['Yes', 'No']} /></Row>
            <Row label="I have read & agree to the KL Levels *"><Select value={form.agree_to_levels} onChange={v => set('agree_to_levels', v)} options={['Yes', 'No']} /></Row>
            <Row label="Client Notes"><Textarea value={form.client_notes} onChange={v => set('client_notes', v)} placeholder="Add any comments you like." /></Row>
            <Row label="Signature *">
              <p style={s.hint}>I certify that all of the information provided in this application is true and accurate to the best of my knowledge.</p>
              <Input value={form.signature} onChange={v => set('signature', v)} placeholder="Type your full name to sign" />
            </Row>
          </>}
        </div>

        <div style={s.nav}>
          {step > 0 && <button onClick={() => setStep(s => s - 1)} style={s.prevBtn}>Previous</button>}
          {step < sections.length - 1 && <button onClick={handleNext} style={s.nextBtn}>Next</button>}
          {step === sections.length - 1 && (
            <button onClick={handleSubmit} style={s.submitBtn} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div style={{ marginBottom: '20px' }}>
    <label style={{ color: '#d0d0d0', fontSize: '14px', display: 'block', marginBottom: '6px' }}>{label}</label>
    {children}
  </div>
);

const Input = ({ value, onChange, placeholder, type = 'text' }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }} />
);

const Textarea = ({ value, onChange, placeholder }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
    style={{ width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', color: '#fff', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
);

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', color: value ? '#fff' : '#888', fontSize: '14px' }}>
    <option value="">Select an option</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const s = {
  container: { minHeight: '100vh', backgroundColor: '#1a1a1a', display: 'flex', justifyContent: 'center', padding: '40px 20px', fontFamily: 'sans-serif' },
  card: { backgroundColor: '#2a2a2a', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '680px', borderTop: '4px solid #b22222' },
  logo: { width: '150px', display: 'block', margin: '0 auto 16px auto', borderRadius: '4px' },
  title: { color: '#fff', fontSize: '22px', fontWeight: '700', textAlign: 'center', margin: '0 0 24px 0' },
  steps: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
  stepDot: { width: '8px', height: '8px', borderRadius: '50%' },
  stepLabel: {},
  section: {},
  sectionTitle: { color: '#fff', fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0', paddingBottom: '8px', borderBottom: '1px solid #444' },
  hint: { color: '#888', fontSize: '12px', margin: '0 0 8px 0', lineHeight: '1.5' },
  nav: { display: 'flex', justifyContent: 'space-between', marginTop: '32px' },
  prevBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#a0a0a0', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  nextBtn: { backgroundColor: '#b22222', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', marginLeft: 'auto' },
  submitBtn: { backgroundColor: '#16a34a', border: 'none', color: '#fff', padding: '10px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginLeft: 'auto' },
  successTitle: { color: '#fff', fontSize: '22px', textAlign: 'center', margin: '16px 0 8px 0' },
  successText: { color: '#a0a0a0', fontSize: '15px', textAlign: 'center', lineHeight: '1.6' },
  medBlock: { background: '#1a1a1a', borderRadius: '10px', padding: '16px', marginBottom: '12px', border: '1px solid #333' },
  treatmentBlock: { background: '#1a1a1a', borderRadius: '10px', padding: '16px', marginBottom: '12px', border: '1px solid #333' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  fieldLabel: { display: 'block', color: '#aaa', fontSize: '12px', marginBottom: '4px' },
  addBtn: { backgroundColor: 'transparent', border: '1px solid #444', color: '#aaa', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '16px' },
  removeBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
};

export default ApplicationForm;