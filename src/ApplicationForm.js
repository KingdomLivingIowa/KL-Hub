import { useState } from 'react';
import { supabase } from './supabaseClient';
import logo from './kingdom-living-logo.jpg';

const sections = ['General Info', 'Recovery', 'Emergency Contacts', 'Legal History', 'Information Accuracy'];

function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
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
    employer_name: '', substance_history: '', oud_diagnosis: '',
    recovery_meetings: '', attended_treatment: '',
    takes_medication: '', medication_details: '',
    emergency_contact: '', collateral_contacts: '',
    on_probation: '', on_parole: '', po_name: '', po_phone: '',
    criminal_history: '', sex_offender: '', sex_offense_details: '',
    correspondence_contact: '', form_completed_by: '', agree_to_rules: '',
    agree_to_levels: '', client_notes: '', signature: '',
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

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
    const { error: submitError } = await supabase.from('applications').insert([{
      ...form,
      full_name: `${form.first_name} ${form.last_name}`,
      status: 'pending',
    }]);
    setLoading(false);
    if (!submitError) setSubmitted(true);
    else alert('There was an error submitting. Please try again.');
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
              <Row label="Are you able to work? *">
                <Select value={form.able_to_work} onChange={v => set('able_to_work', v)} options={['Yes', 'No']} />
                <p style={s.hint}>If No, you will be required to volunteer.</p>
              </Row>
              {form.able_to_work === 'No' && <Row label="Do you agree to the volunteer requirement? *"><Select value={form.agree_to_volunteer} onChange={v => set('agree_to_volunteer', v)} options={['Yes', 'No']} /></Row>}
            </>}
            <Row label="Allergy Information"><Textarea value={form.allergy_info} onChange={v => set('allergy_info', v)} /></Row>
            <Row label="Doctor Name & Phone Number"><Textarea value={form.doctor_info} onChange={v => set('doctor_info', v)} /></Row>
            <Row label="Employment Status *"><Select value={form.employment_status} onChange={v => set('employment_status', v)} options={['Employed Full-Time', 'Employed Part-Time', 'Self-Employed', 'Unemployed', 'Unable to Work', 'NONE']} /></Row>
            {form.employment_status !== 'NONE' && form.employment_status !== 'Unemployed' && form.employment_status !== 'Unable to Work' && form.employment_status !== '' &&
              <Row label="Employer Name"><Input value={form.employer_name} onChange={v => set('employer_name', v)} placeholder="Name of Current Employer" /></Row>}
          </>}

          {step === 1 && <>
            <h3 style={s.sectionTitle}>Recovery</h3>
            <Row label="Do you have a past or current history of substance or alcohol misuse? *"><Select value={form.substance_history} onChange={v => set('substance_history', v)} options={['Yes', 'No']} /></Row>
            <Row label="Are you diagnosed with opiate use disorder (OUD)? *"><Select value={form.oud_diagnosis} onChange={v => set('oud_diagnosis', v)} options={['Yes', 'No']} /></Row>
            <Row label="What type of recovery meetings do you attend? *"><Select value={form.recovery_meetings} onChange={v => set('recovery_meetings', v)} options={['AA', 'NA', 'Both AA & NA', 'Smart Recovery', 'Other', 'None']} /></Row>
            <h3 style={s.sectionTitle}>Treatment</h3>
            <Row label="Have you ever attended addiction treatment, PHP, IOP, or lived in another recovery house program? *"><Select value={form.attended_treatment} onChange={v => set('attended_treatment', v)} options={['Yes', 'No']} /></Row>
            <h3 style={s.sectionTitle}>Medications</h3>
            <Row label="Do you take any prescription medication? *"><Select value={form.takes_medication} onChange={v => set('takes_medication', v)} options={['Yes', 'No']} /></Row>
            {form.takes_medication === 'Yes' && <Row label="Please list your medications"><Textarea value={form.medication_details} onChange={v => set('medication_details', v)} /></Row>}
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
};

export default ApplicationForm;