import { useState } from 'react';
import { supabase } from './supabaseClient';
import logo from './kingdom-living-logo.jpg';

const sections = ['Applicant Info', 'Children', 'Employment', 'Recovery', 'Emergency Contact', 'Legal History', 'Certify'];

const emptyMed = () => ({ name: '', dose_unit: '', dose_count: '', count: '', times: [], notes: '' });

const DRUG_OPTIONS = [
  'Heroin (Smack, H)', 'Fentanyl', 'Morphine', 'Oxycodone (OxyContin, Percocet)', 'Hydrocodone (Vicodin)',
  'Codeine', 'Methadone', 'Tramadol', 'Buprenorphine (Suboxone, Subutex)', 'Cocaine (Coke)',
  'Crack cocaine (Crack)', 'Methamphetamine (Meth, Crystal)', 'Amphetamine (Adderall)',
  'Methylphenidate (Ritalin, Concerta)', 'MDMA (Ecstasy, Molly)', 'Marijuana (Cannabis, Weed, Pot)',
  'Synthetic cannabinoids (Spice or K2)', 'Alcohol', 'Nicotine (Tobacco)', 'LSD (Acid)', 'Psilocybin (Magic Mushrooms)',
  'Mescaline (Peyote)', 'Phencyclidine (PCP or Angel Dust)', 'Salvia', 'Ketamine (Special K)',
  'DXM (Dextromethorphan)', 'GHB (Gamma-hydroxybutyrate)', 'Rohypnol (Roofies)', 'Diazepam (Valium)',
  'Alprazolam (Xanax)', 'Lorazepam (Ativan)', 'Clonazepam (Klonopin)', 'Barbiturates', 'Inhalants',
  'Bath salts (Synthetic cathinones)', 'Kratom', 'Flunitrazepam (Rohypnol)', 'Chloral hydrate',
  'Methaqualone (Quaalude)', 'DMT (Dimethyltryptamine)', 'Ayahuasca', 'Ibogaine', 'Khat',
  'Mephedrone (Meow Meow)', 'Methylone', 'Benzylpiperazine (BZP)', 'PMA/PMMA (Death)', 'Xylazine',
];

const RECOVERY_PROGRAM_OPTIONS = [
  'AA', 'NA', 'CA', 'ACA', 'CMA', 'GA', 'HA', 'MA', 'SAA', 'SLAA', 'SMART Recovery',
  'LifeRing Secular Recovery', 'Recovery Dharma', 'SOS (Secular Organizations for Sobriety)',
  'Refuge Recovery', 'Celebrate Recovery',
];

const ADMIN_TIME_OPTIONS = ['M', 'A', 'E', 'N', 'PRN'];

function KinshipApplicationForm() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedDrugs, setSelectedDrugs] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [medications, setMedications] = useState([emptyMed()]);
  const [form, setForm] = useState({
    primary_first_name: '', primary_last_name: '', primary_dob: '',
    primary_phone: '', primary_sms_consent: '',
    primary_email: '', primary_email_consent: '',
    primary_address: '', primary_relationship_to_children: '',
    co_applicant_name: '', co_applicant_dob: '', co_applicant_phone: '',
    co_applicant_email: '', co_applicant_address: '', co_applicant_relationship_to_children: '',
    coming_from_kl_housing: '', coming_from_kl_housing_name: '',
    child1_name: '', child1_dob: '', child2_name: '', child2_dob: '',
    child3_name: '', child3_dob: '', child4_name: '', child4_dob: '',
    primary_employment_status: '', primary_employer: '', primary_income: '',
    co_applicant_employment_status: '', co_applicant_employer: '', co_applicant_income: '',
    sober_date: '', attended_treatment: '',
    treatment_name: '', treatment_contact_name: '', treatment_contact_title: '',
    treatment_contact_phone: '', treatment_contact_email: '', treatment_discharge_date: '',
    treatment_level_of_care: '', treatment_referred: '', treatment_referral_date: '',
    takes_medication: '',
    ec_first_name: '', ec_last_name: '', ec_relationship: '', ec_phone: '', ec_email: '',
    ec_address: '', ec_additional_info: '',
    on_probation: '', on_parole: '', po_name: '', po_phone: '', po_completion_date: '',
    criminal_history: '', sex_offender: '', sex_offense_details: '',
    child_abuse_registry: '', pending_charges: '', protective_order: '',
    primary_signature: '', co_applicant_signature: '',
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggle = (setFn, list, value) => {
    setFn(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const updateMed = (i, field, value) => {
    const updated = [...medications];
    updated[i] = { ...updated[i], [field]: value };
    setMedications(updated);
  };

  const toggleMedTime = (i, time) => {
    const updated = [...medications];
    const times = updated[i].times.includes(time) ? updated[i].times.filter(t => t !== time) : [...updated[i].times, time];
    updated[i] = { ...updated[i], times };
    setMedications(updated);
  };

  const validate = () => {
    if (step === 0) {
      if (!form.primary_first_name) return 'Primary Applicant First Name is required.';
      if (!form.primary_last_name) return 'Primary Applicant Last Name is required.';
      if (!form.primary_dob) return 'Primary Applicant Date of Birth is required.';
      if (!form.primary_email) return 'Primary Applicant Email is required.';
      if (!form.coming_from_kl_housing) return 'Please answer: Are one or both of you coming from KL housing?';
      if (form.coming_from_kl_housing === 'Yes' && !form.coming_from_kl_housing_name) return 'Please provide the name(s).';
    }
    if (step === 2) {
      if (!form.primary_employment_status) return 'Primary Applicant Employment Status is required.';
      if (form.primary_employment_status !== 'None' && !form.primary_employer) return 'Primary Applicant Place of Employment is required.';
    }
    if (step === 3) {
      if (selectedDrugs.length === 0) return 'Please select at least one Drug of Choice.';
      if (selectedPrograms.length === 0) return 'Please select at least one Recovery Program.';
      if (!form.sober_date) return 'Sober Date / Recovery Date is required.';
      if (!form.attended_treatment) return 'Please answer the treatment history question.';
      if (form.attended_treatment === 'Yes' && !form.treatment_name) return 'Treatment Name is required.';
      if (!form.takes_medication) return 'Please answer: Do you take any prescription medication?';
      if (form.takes_medication === 'Yes' && !medications.some(m => m.name)) return 'Please list at least one medication.';
    }
    if (step === 5) {
      if (!form.on_probation) return 'Please answer: Are you on Probation?';
      if (!form.on_parole) return 'Please answer: Are you on Parole?';
      if (!form.criminal_history) return 'Criminal History is required.';
      if (!form.sex_offender) return 'Please answer: Are you a Registered Sex Offender?';
      if (!form.child_abuse_registry) return 'Please answer the child abuse and neglect registry question.';
      if (!form.pending_charges) return 'Please answer the pending criminal charges question.';
      if (!form.protective_order) return 'Please answer the no-contact / protective order question.';
    }
    if (step === 6) {
      if (!form.primary_signature) return 'Primary Applicant Signature is required.';
      if (form.co_applicant_name && !form.co_applicant_signature) return 'Partner/Co-Applicant Signature is required.';
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

    const payload = {
      ...form,
      drug_of_choice: selectedDrugs.join(', '),
      recovery_program: selectedPrograms.join(', '),
      medication_details: form.takes_medication === 'Yes' ? JSON.stringify(medications.filter(m => m.name)) : null,
      status: 'pending',
    };

    const { error: insertError } = await supabase.from('kinship_applications').insert([payload]);

    setLoading(false);
    if (insertError) {
      console.error('Kinship application submit error:', insertError);
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
        <p style={s.successText}>Thank you for applying to the Keys to Kinship program. We will review your application and contact you via email with next steps.</p>
      </div>
    </div>
  );

  return (
    <div style={s.container}>
      <div style={s.card}>
        <img src={logo} alt="Kingdom Living" style={s.logo} />
        <h2 style={s.title}>Kinship Application</h2>
        <p style={s.intro}>Please complete all sections fully and accurately. Information provided on this application is confidential and will be used solely to determine eligibility for the Keys to Kinship program.</p>

        <div style={s.steps}>
          {sections.map((sec, i) => (
            <div key={i} style={{ ...s.stepItem, color: i === step ? '#b22222' : i < step ? '#16a34a' : '#71717a' }}>
              <div style={{ ...s.stepDot, backgroundColor: i === step ? '#b22222' : i < step ? '#16a34a' : '#b0b0b7' }} />
              <span style={s.stepLabel}>{sec}</span>
            </div>
          ))}
        </div>

        <div style={s.section}>
          {step === 0 && <>
            <h3 style={s.sectionTitle}>Applicant Information</h3>
            <Row label="Primary Applicant First Name *"><Input value={form.primary_first_name} onChange={v => set('primary_first_name', v)} /></Row>
            <Row label="Primary Applicant Last Name *"><Input value={form.primary_last_name} onChange={v => set('primary_last_name', v)} /></Row>
            <Row label="Primary Applicant Date of Birth *"><Input value={form.primary_dob} onChange={v => set('primary_dob', v)} type="date" /></Row>
            <Row label="Primary Applicant Phone Number"><Input value={form.primary_phone} onChange={v => set('primary_phone', v)} /></Row>
            <Consent checked={form.primary_sms_consent === 'Yes'} onChange={v => set('primary_sms_consent', v ? 'Yes' : '')}
              label="I consent to receive automated SMS messages from Kingdom Living."
              disclaimer="SMS is not a secure, encrypted communication method. Carriers may store copies of these messages. Message frequency varies. Msg & data rates may apply. Text STOP to cancel." />
            <Row label="Primary Applicant Email *"><Input value={form.primary_email} onChange={v => set('primary_email', v)} type="email" /></Row>
            <Consent checked={form.primary_email_consent === 'Yes'} onChange={v => set('primary_email_consent', v ? 'Yes' : '')}
              label="I consent to receive email communications from Kingdom Living." />
            <Row label="Primary Applicant Address"><Input value={form.primary_address} onChange={v => set('primary_address', v)} /></Row>
            <Row label="Primary Applicant Relationship to Child(ren)"><Input value={form.primary_relationship_to_children} onChange={v => set('primary_relationship_to_children', v)} /></Row>

            <h3 style={{ ...s.sectionTitle, marginTop: '28px' }}>Partner / Co-Applicant (if applicable)</h3>
            <Row label="Partner / Co-Applicant Name"><Input value={form.co_applicant_name} onChange={v => set('co_applicant_name', v)} /></Row>
            <Row label="Co-Applicant Date of Birth"><Input value={form.co_applicant_dob} onChange={v => set('co_applicant_dob', v)} type="date" /></Row>
            <Row label="Co-Applicant Phone Number"><Input value={form.co_applicant_phone} onChange={v => set('co_applicant_phone', v)} /></Row>
            <Row label="Co-Applicant Email"><Input value={form.co_applicant_email} onChange={v => set('co_applicant_email', v)} type="email" /></Row>
            <Row label="Co-Applicant Address"><Input value={form.co_applicant_address} onChange={v => set('co_applicant_address', v)} /></Row>
            <Row label="Co-Applicant Relationship to Child(ren)"><Input value={form.co_applicant_relationship_to_children} onChange={v => set('co_applicant_relationship_to_children', v)} /></Row>
            <Row label="Are one or both of you coming from KL housing? *"><Select value={form.coming_from_kl_housing} onChange={v => set('coming_from_kl_housing', v)} options={['Yes', 'No']} /></Row>
            {form.coming_from_kl_housing === 'Yes' && <Row label="If yes, name(s): *"><Input value={form.coming_from_kl_housing_name} onChange={v => set('coming_from_kl_housing_name', v)} /></Row>}
          </>}

          {step === 1 && <>
            <h3 style={s.sectionTitle}>Children Information</h3>
            <p style={s.hint}>List all children who will reside in the home.</p>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={s.grid2}>
                <div><label style={s.fieldLabel}>Child {n} Full Name</label><Input value={form[`child${n}_name`]} onChange={v => set(`child${n}_name`, v)} /></div>
                <div><label style={s.fieldLabel}>Child {n} Date of Birth</label><Input value={form[`child${n}_dob`]} onChange={v => set(`child${n}_dob`, v)} type="date" /></div>
              </div>
            ))}
          </>}

          {step === 2 && <>
            <h3 style={s.sectionTitle}>Employment Information</h3>
            <Row label="Primary Applicant Employment Status *">
              <Select value={form.primary_employment_status} onChange={v => set('primary_employment_status', v)} options={['Full-time', 'Part-time', 'Student', 'Unemployed', 'Self-employed', 'Retired', 'None']} />
            </Row>
            <div style={s.grid2}>
              <div><label style={s.fieldLabel}>Place of Employment</label><Input value={form.primary_employer} onChange={v => set('primary_employer', v)} /></div>
              <div><label style={s.fieldLabel}>Monthly/Annual Income</label><Input value={form.primary_income} onChange={v => set('primary_income', v)} /></div>
            </div>
            <Row label="Co-Applicant Employment Status">
              <Select value={form.co_applicant_employment_status} onChange={v => set('co_applicant_employment_status', v)} options={['Full-time', 'Part-time', 'Student', 'Unemployed', 'Self-employed', 'Retired', 'None']} />
            </Row>
            <div style={s.grid2}>
              <div><label style={s.fieldLabel}>Place of Employment</label><Input value={form.co_applicant_employer} onChange={v => set('co_applicant_employer', v)} /></div>
              <div><label style={s.fieldLabel}>Monthly/Annual Income</label><Input value={form.co_applicant_income} onChange={v => set('co_applicant_income', v)} /></div>
            </div>
          </>}

          {step === 3 && <>
            <h3 style={s.sectionTitle}>Recovery</h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={s.fieldLabel}>Drug of Choice * (select all that apply)</label>
              <div style={s.checkGrid}>
                {DRUG_OPTIONS.map(d => (
                  <CheckOption key={d} label={d} checked={selectedDrugs.includes(d)} onChange={() => toggle(setSelectedDrugs, selectedDrugs, d)} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={s.fieldLabel}>Recovery Program * (select all that apply)</label>
              <div style={s.checkGrid}>
                {RECOVERY_PROGRAM_OPTIONS.map(p => (
                  <CheckOption key={p} label={p} checked={selectedPrograms.includes(p)} onChange={() => toggle(setSelectedPrograms, selectedPrograms, p)} />
                ))}
              </div>
            </div>
            <Row label="How long have you been sober? (Sober Date / Recovery Date) *"><Input value={form.sober_date} onChange={v => set('sober_date', v)} type="date" /></Row>

            <h3 style={s.sectionTitle}>Treatment</h3>
            <Row label="Have you ever attended addiction treatment, PHP, IOP, or lived in another recovery house program? *">
              <Select value={form.attended_treatment} onChange={v => set('attended_treatment', v)} options={['Yes', 'No']} />
            </Row>
            {form.attended_treatment === 'Yes' && <>
              <div style={s.treatmentBlock}>
                <div style={s.grid2}>
                  <div><label style={s.fieldLabel}>Treatment Name</label><Input value={form.treatment_name} onChange={v => set('treatment_name', v)} /></div>
                  <div><label style={s.fieldLabel}>Contact Name</label><Input value={form.treatment_contact_name} onChange={v => set('treatment_contact_name', v)} /></div>
                  <div><label style={s.fieldLabel}>Job Title</label><Input value={form.treatment_contact_title} onChange={v => set('treatment_contact_title', v)} /></div>
                  <div><label style={s.fieldLabel}>Contact Phone</label><Input value={form.treatment_contact_phone} onChange={v => set('treatment_contact_phone', v)} /></div>
                  <div><label style={s.fieldLabel}>Contact Email</label><Input value={form.treatment_contact_email} onChange={v => set('treatment_contact_email', v)} type="email" /></div>
                  <div><label style={s.fieldLabel}>Discharge Date</label><Input value={form.treatment_discharge_date} onChange={v => set('treatment_discharge_date', v)} type="date" /></div>
                </div>
                <Row label="Level of Care"><Select value={form.treatment_level_of_care} onChange={v => set('treatment_level_of_care', v)} options={['Recovery Residence', 'Outpatient', 'Intensive Outpatient', 'Partial Hospitalization Program', 'Residential', 'Inpatient']} /></Row>
                <div style={s.grid2}>
                  <div><label style={s.fieldLabel}>Referral</label><Select value={form.treatment_referred} onChange={v => set('treatment_referred', v)} options={['Was referred', 'Was not referred']} /></div>
                  <div><label style={s.fieldLabel}>Referral Date</label><Input value={form.treatment_referral_date} onChange={v => set('treatment_referral_date', v)} type="date" /></div>
                </div>
              </div>
            </>}

            <h3 style={s.sectionTitle}>Medications</h3>
            <Row label="Do you take any prescription medication? *">
              <Select value={form.takes_medication} onChange={v => set('takes_medication', v)} options={['Yes', 'No']} />
            </Row>
            {form.takes_medication === 'Yes' && <>
              <p style={{ ...s.hint, marginBottom: '12px' }}>M = Morning · A = Afternoon · E = Evening · N = Night · PRN = As needed</p>
              {medications.map((med, i) => (
                <div key={i} style={s.medBlock}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ color: '#18181b', fontSize: '14px', fontWeight: '500' }}>Medication {i + 1}</span>
                    {medications.length > 1 && <button onClick={() => setMedications(medications.filter((_, idx) => idx !== i))} style={s.removeBtn}>Remove</button>}
                  </div>
                  <div style={s.grid2}>
                    <div><label style={s.fieldLabel}>Medication</label><Input value={med.name} onChange={v => updateMed(i, 'name', v)} /></div>
                    <div><label style={s.fieldLabel}>Dose Unit</label><Input value={med.dose_unit} onChange={v => updateMed(i, 'dose_unit', v)} placeholder="e.g. mg" /></div>
                    <div><label style={s.fieldLabel}>Dose Count</label><Input value={med.dose_count} onChange={v => updateMed(i, 'dose_count', v)} /></div>
                    <div><label style={s.fieldLabel}>Count</label><Input value={med.count} onChange={v => updateMed(i, 'count', v)} /></div>
                  </div>
                  <div style={{ margin: '10px 0' }}>
                    <label style={s.fieldLabel}>Administration Times</label>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
                      {ADMIN_TIME_OPTIONS.map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#52525b', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={med.times.includes(t)} onChange={() => toggleMedTime(i, t)} style={{ accentColor: '#b22222' }} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div><label style={s.fieldLabel}>Notes</label><Input value={med.notes} onChange={v => updateMed(i, 'notes', v)} /></div>
                </div>
              ))}
              <button onClick={() => setMedications([...medications, emptyMed()])} style={s.addBtn}>+ Add Medication</button>
            </>}
          </>}

          {step === 4 && <>
            <h3 style={s.sectionTitle}>Emergency Contact</h3>
            <div style={s.grid2}>
              <div><label style={s.fieldLabel}>First Name</label><Input value={form.ec_first_name} onChange={v => set('ec_first_name', v)} /></div>
              <div><label style={s.fieldLabel}>Last Name</label><Input value={form.ec_last_name} onChange={v => set('ec_last_name', v)} /></div>
            </div>
            <div style={s.grid2}>
              <div><label style={s.fieldLabel}>Relationship</label><Input value={form.ec_relationship} onChange={v => set('ec_relationship', v)} /></div>
              <div><label style={s.fieldLabel}>Phone Number</label><Input value={form.ec_phone} onChange={v => set('ec_phone', v)} /></div>
            </div>
            <Row label="Email"><Input value={form.ec_email} onChange={v => set('ec_email', v)} type="email" /></Row>
            <Row label="Address"><Input value={form.ec_address} onChange={v => set('ec_address', v)} /></Row>
            <Row label="Additional Info"><Textarea value={form.ec_additional_info} onChange={v => set('ec_additional_info', v)} /></Row>
          </>}

          {step === 5 && <>
            <h3 style={s.sectionTitle}>Legal History</h3>
            <Row label="Are you on Probation? *"><Select value={form.on_probation} onChange={v => set('on_probation', v)} options={['Yes', 'No']} /></Row>
            <Row label="Are you on Parole? *"><Select value={form.on_parole} onChange={v => set('on_parole', v)} options={['Yes', 'No']} /></Row>
            {(form.on_probation === 'Yes' || form.on_parole === 'Yes') && <>
              <div style={s.grid2}>
                <div><label style={s.fieldLabel}>Probation / Parole Officer Name</label><Input value={form.po_name} onChange={v => set('po_name', v)} /></div>
                <div><label style={s.fieldLabel}>Probation / Parole Officer Phone</label><Input value={form.po_phone} onChange={v => set('po_phone', v)} /></div>
              </div>
              <Row label="Probation / Parole Completion Date"><Input value={form.po_completion_date} onChange={v => set('po_completion_date', v)} type="date" /></Row>
            </>}
            <Row label="Criminal History (describe everything in last 5 years) *"><Textarea value={form.criminal_history} onChange={v => set('criminal_history', v)} /></Row>
            <Row label="Are you a Registered Sex Offender? *"><Select value={form.sex_offender} onChange={v => set('sex_offender', v)} options={['Yes', 'No']} /></Row>
            {form.sex_offender === 'Yes' && <Row label="Sex Offense Details"><Textarea value={form.sex_offense_details} onChange={v => set('sex_offense_details', v)} /></Row>}
            <Row label="Is either applicant listed on a child abuse and neglect registry? *"><Select value={form.child_abuse_registry} onChange={v => set('child_abuse_registry', v)} options={['Yes', 'No']} /></Row>
            <Row label="Does either applicant have current criminal charges pending? *"><Select value={form.pending_charges} onChange={v => set('pending_charges', v)} options={['Yes', 'No']} /></Row>
            <Row label="Does either applicant have an active no-contact or protective order? *"><Select value={form.protective_order} onChange={v => set('protective_order', v)} options={['Yes', 'No']} /></Row>
          </>}

          {step === 6 && <>
            <h3 style={s.sectionTitle}>Information Accuracy</h3>
            <p style={s.hint}>I certify that the information provided in this application is true and complete to the best of my knowledge. I understand that providing false information may result in denial or termination from the Keys to Kinship program.</p>
            <Row label="Primary Applicant Signature *"><Input value={form.primary_signature} onChange={v => set('primary_signature', v)} placeholder="Type your full name to sign" /></Row>
            <Row label={`Partner/Co-Applicant Signature${form.co_applicant_name ? ' *' : ''}`}><Input value={form.co_applicant_signature} onChange={v => set('co_applicant_signature', v)} placeholder="Type your full name to sign" /></Row>
          </>}
        </div>

        <div style={s.nav}>
          {step > 0 && <button onClick={() => setStep(st => st - 1)} style={s.prevBtn}>Previous</button>}
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
    <label style={{ color: '#3f3f46', fontSize: '14px', display: 'block', marginBottom: '6px' }}>{label}</label>
    {children}
  </div>
);

const Input = ({ value, onChange, placeholder, type = 'text' }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: '100%', backgroundColor: '#ffffff', border: '1px solid #b0b0b7', borderRadius: '8px', padding: '10px 14px', color: '#18181b', fontSize: '14px', boxSizing: 'border-box' }} />
);

const Textarea = ({ value, onChange, placeholder }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
    style={{ width: '100%', backgroundColor: '#ffffff', border: '1px solid #b0b0b7', borderRadius: '8px', padding: '10px 14px', color: '#18181b', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
);

const Select = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ width: '100%', backgroundColor: '#ffffff', border: '1px solid #b0b0b7', borderRadius: '8px', padding: '10px 14px', color: value ? '#18181b' : '#6b7280', fontSize: '14px' }}>
    <option value="">Select an option</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const CheckOption = ({ label, checked, onChange }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${checked ? '#b22222' : '#c9c9cf'}`, background: checked ? 'rgba(178,34,34,0.1)' : '#ffffff' }}>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: '#b22222', width: '16px', height: '16px', flexShrink: 0 }} />
    <span style={{ color: checked ? '#18181b' : '#52525b', fontSize: '13px', lineHeight: '1.3' }}>{label}</span>
  </label>
);

const Consent = ({ checked, onChange, label, disclaimer }) => (
  <div style={{ marginBottom: '18px', marginTop: '-10px' }}>
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#b22222', cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ fontSize: '13px', color: '#52525b', lineHeight: 1.5 }}>{label}</span>
    </label>
    {disclaimer && <p style={{ color: '#9ca3af', fontSize: '11px', margin: '4px 0 0 26px', lineHeight: 1.5 }}>{disclaimer}</p>}
  </div>
);

const s = {
  container: { minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'center', padding: '40px 20px', fontFamily: 'sans-serif' },
  card: { backgroundColor: '#e4e4e8', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '680px', borderTop: '4px solid #b22222' },
  logo: { width: '150px', display: 'block', margin: '0 auto 16px auto', borderRadius: '4px' },
  title: { color: '#18181b', fontSize: '22px', fontWeight: '700', textAlign: 'center', margin: '0 0 8px 0' },
  intro: { color: '#52525b', fontSize: '13px', textAlign: 'center', margin: '0 0 24px 0', lineHeight: 1.6 },
  steps: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
  stepDot: { width: '8px', height: '8px', borderRadius: '50%' },
  stepLabel: {},
  section: {},
  sectionTitle: { color: '#18181b', fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0', paddingBottom: '8px', borderBottom: '1px solid #b0b0b7' },
  hint: { color: '#6b7280', fontSize: '12px', margin: '0 0 8px 0', lineHeight: '1.5' },
  nav: { display: 'flex', justifyContent: 'space-between', marginTop: '32px' },
  prevBtn: { backgroundColor: 'transparent', border: '1px solid #b0b0b7', color: '#52525b', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  nextBtn: { backgroundColor: '#b22222', border: 'none', color: '#18181b', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', marginLeft: 'auto' },
  submitBtn: { backgroundColor: '#16a34a', border: 'none', color: '#18181b', padding: '10px 28px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginLeft: 'auto' },
  successTitle: { color: '#18181b', fontSize: '22px', textAlign: 'center', margin: '16px 0 8px 0' },
  successText: { color: '#52525b', fontSize: '15px', textAlign: 'center', lineHeight: '1.6' },
  medBlock: { background: '#ffffff', borderRadius: '10px', padding: '16px', marginBottom: '12px', border: '1px solid #c9c9cf' },
  treatmentBlock: { background: '#ffffff', borderRadius: '10px', padding: '16px', marginBottom: '20px', border: '1px solid #c9c9cf' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  checkGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' },
  fieldLabel: { display: 'block', color: '#52525b', fontSize: '12px', marginBottom: '4px' },
  addBtn: { backgroundColor: 'transparent', border: '1px solid #b0b0b7', color: '#52525b', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '16px' },
  removeBtn: { backgroundColor: 'transparent', border: '1px solid #dc2626', color: '#dc2626', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' },
};

export default KinshipApplicationForm;