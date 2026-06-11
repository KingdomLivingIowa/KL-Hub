import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { profilePhotoBase64, profilePhotoExt, profilePhotoMime, uniqueId, ...applicationData } = body;

    // Handle profile photo upload if provided
    let photoUrl = null;
    if (profilePhotoBase64 && profilePhotoExt && uniqueId) {
      const fileName = `${uniqueId}_${Date.now()}.${profilePhotoExt}`;
      const photoBytes = Uint8Array.from(atob(profilePhotoBase64), c => c.charCodeAt(0));
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, photoBytes, { contentType: profilePhotoMime || 'image/jpeg' });
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }
    }

    // Insert the application using service role (bypasses RLS)
    const { data: insertedApp, error: appError } = await supabase
      .from('applications')
      .insert([{ ...applicationData, photo_url: photoUrl }])
      .select('id')
      .single();

    if (appError) {
      console.error('Insert error:', appError);
      return new Response(JSON.stringify({ error: appError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ id: insertedApp.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});