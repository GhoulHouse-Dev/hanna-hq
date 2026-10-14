update public.admin_tasks
set owner_text = 'Jami + Hanna',
    task_instruction = 'Avaa Suomi.fi Valtuudet. Varmista, että tarvittavat valtuutukset ovat hyväksytty ja että GhoulHousen OmaVero-käyttö toimii. Kirjaa näyttö.'
where id = '71b57cd5-ec2f-487f-a34e-83263dcd4ae3';

update public.admin_tasks
set title = 'Netvisor ja käyttöoikeudet',
    owner_text = 'Jami + Hanna',
    task_instruction = 'Avaa Netvisor. Varmista tarvittavat käyttöoikeudet, yritys-/ALV-/pankkiasetukset ja Holvin tapahtumien siirtyminen.'
where id = 'c0c7c50a-9299-402e-8420-588a0c768a04';

update public.admin_tasks set owner_text = 'Jami + Hanna'
where id = '124c0715-8df5-4db5-8243-0629cd35bef0';

update public.admin_tasks set owner_text = 'Jami + Hanna'
where id = '6116d01b-abf0-4b6d-a7d4-8326b3924a88';

update public.admin_tasks
set title = 'Mahdollinen yhtiölaina', owner_text = 'Jami + Hanna'
where id = 'e1c7a82d-148b-4031-ba33-ecd069b587b3';

update public.admin_tasks set owner_text = 'Hanna + Jami'
where id = '4d51c79c-3634-4e26-ac92-0361e20b871e';

update public.admin_tasks set owner_text = 'Jami + Hanna'
where id = '3241672e-3111-49f3-a071-3bd036bd1fb8';
