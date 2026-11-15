import type { DayOfWeek, Language } from './types';

export interface Translations {
  brandShort: string;
  brandName: string;
  tagline: string;
  navChat: string;
  navInfo: string;
  navDashboard: string;
  activeBusinessLabel: string;
  languageLabel: string;
  noBusinessAddedTitle: string;
  noBusinessAddedBody: string;
  addFirstBusinessButton: string;
  chatWelcomeTitle: string;
  chatWelcomeBody: string;
  chatPlaceholder: string;
  sendButton: string;
  sendingButton: string;
  clearChat: string;
  quickPromptsLabel: string;
  quickPrompts: string[];
  humanAssistTitle: string;
  humanAssistDesc: string;
  whatsappButton: string;
  whatsappDisclaimer: string;
  noWhatsappConfigured: string;
  verifiedInfoTitle: string;
  servicesHeading: string;
  hoursHeading: string;
  locationHeading: string;
  contactHeading: string;
  closedLabel: string;
  noServicesEmpty: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  isolationNote: string;
  newBusinessButton: string;
  createBusinessTitle: string;
  createBusinessSubmit: string;
  cancelButton: string;
  businessNameLabel: string;
  categoryLabel: string;
  selectCategoryPlaceholder: string;
  categorySearchPlaceholder: string;
  noCategoriesMatch: string;
  customCategoryPlaceholder: string;
  categoryRequiredError: string;
  descriptionLabel: string;
  addressLabel: string;
  districtLabel: string;
  sectorLabel: string;
  selectDistrictPlaceholder: string;
  selectSectorPlaceholder: string;
  districtSearchPlaceholder: string;
  sectorSearchPlaceholder: string;
  noLocationMatch: string;
  locationRequiredError: string;
  countryLabel: string;
  selectCountryPlaceholder: string;
  countrySearchPlaceholder: string;
  countryRequiredError: string;
  regionLabel: string;
  selectRegionPlaceholder: string;
  regionSearchPlaceholder: string;
  cityLabel: string;
  selectCityPlaceholder: string;
  citySearchPlaceholder: string;
  enterCityManually: string;
  manualCityPlaceholder: string;
  backToCityList: string;
  loadingLocations: string;
  cityRequiredError: string;
  phoneLabel: string;
  whatsappLabel: string;
  whatsappHelp: string;
  emailLabel: string;
  handoffNoteLabel: string;
  publishedLabel: string;
  publishedHelp: string;
  draftStatusLabel: string;
  publishedStatusLabel: string;
  saveChanges: string;
  savingChanges: string;
  savedToast: string;
  deleteBusinessButton: string;
  confirmDeleteText: string;
  addServiceButton: string;
  serviceNamePlaceholder: string;
  servicePriceLabel: string;
  serviceDurationPlaceholder: string;
  serviceDescPlaceholder: string;
  removeService: string;
  sectionIdentity: string;
  sectionContact: string;
  sectionServices: string;
  sectionHours: string;
  sectionWhatsAppApi: string;
  openLabel: string;
  closeLabel: string;
  errorLoadBusinesses: string;
  errorChatFailed: string;
  privacyNote: string;
  // Phase 3 Auth & Account UI
  authGateTitle: string;
  authGateSubtitle: string;
  signInGoogleButton: string;
  signingInButton: string;
  signOutButton: string;
  signedInAsLabel: string;
  myBusinessesHeading: string;
  noOwnedBusinessesYet: string;
  publicGroupLabel: string;
  // Phase 4 WhatsApp Cloud API UI
  waApiStatusConnected: string;
  waApiStatusNotConfigured: string;
  waWebhookUrlLabel: string;
  waPhoneNumberIdLabel: string;
  waPhoneNumberIdHelp: string;
  waWebhookEnabledLabel: string;
  waSaveIntegrationButton: string;
  waIntegrationSaved: string;
  waSimulatorTitle: string;
  waSimulatorPlaceholder: string;
  waSimulatorRunButton: string;
  waSimulatorRunning: string;
  waSimulatorNote: string;
  waPreviewHumanHandoff: string;
  waPreviewVerifiedReply: string;
  days: Record<DayOfWeek, string>;
}

export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    brandShort: 'ISHYA',
    brandName: 'ISHYA Business',
    tagline: 'Smarter Business. Better Connections.',
    navChat: 'Customer Chat',
    navInfo: 'Business Info',
    navDashboard: 'Business Dashboard',
    activeBusinessLabel: 'Active Business',
    languageLabel: 'Language',
    noBusinessAddedTitle: 'No business added yet',
    noBusinessAddedBody:
      'Register your real business and enter its verified services, prices, opening hours, and WhatsApp contact details to activate your multilingual customer assistant.',
    addFirstBusinessButton: 'Add Your First Business',
    chatWelcomeTitle: 'Ask about services, prices, hours, or location',
    chatWelcomeBody:
      'I answer strictly from this business’s verified profile in Kinyarwanda, English, or French. If a detail is not listed, I will offer direct human assistance.',
    chatPlaceholder: 'Ask a question in Kinyarwanda, English, or French...',
    sendButton: 'Send',
    sendingButton: 'Sending...',
    clearChat: 'Reset Chat',
    quickPromptsLabel: 'Try asking',
    quickPrompts: [
      'What services and prices do you offer?',
      'What are your opening hours?',
      'Where are you located and how can I reach you?',
      'How can I contact your team directly?',
    ],
    humanAssistTitle: 'Need human assistance?',
    humanAssistDesc:
      'For details not listed in the business profile or to arrange a booking directly with staff:',
    whatsappButton: 'Chat on WhatsApp',
    whatsappDisclaimer: 'Opens WhatsApp directly to message the business (wa.me link).',
    noWhatsappConfigured: 'No WhatsApp number is configured for this business yet.',
    verifiedInfoTitle: 'Verified Business Profile',
    servicesHeading: 'Services & Prices',
    hoursHeading: 'Opening Hours',
    locationHeading: 'Location',
    contactHeading: 'Contact Details',
    closedLabel: 'Closed',
    noServicesEmpty: 'No services listed yet. Add services in the Business Dashboard.',
    dashboardTitle: 'Business Owner Dashboard',
    dashboardSubtitle:
      'Manage your business profile, services, pricing, opening hours, and WhatsApp details.',
    isolationNote: 'Your business drafts and settings are private to your account.',
    newBusinessButton: 'New Business',
    createBusinessTitle: 'Register Verified Business Workspace',
    createBusinessSubmit: 'Create Business',
    cancelButton: 'Cancel',
    businessNameLabel: 'Business Name',
    categoryLabel: 'Category',
    selectCategoryPlaceholder: 'Select Business Category',
    categorySearchPlaceholder: 'Search categories...',
    noCategoriesMatch: 'No matching category found',
    customCategoryPlaceholder: 'Enter your business category',
    categoryRequiredError: 'Please select a business category.',
    descriptionLabel: 'Short Description',
    addressLabel: 'Street Address',
    districtLabel: 'District',
    sectorLabel: 'Sector',
    selectDistrictPlaceholder: 'Select District',
    selectSectorPlaceholder: 'Select Sector',
    districtSearchPlaceholder: 'Search districts...',
    sectorSearchPlaceholder: 'Search sectors...',
    noLocationMatch: 'No matching location found',
    locationRequiredError: 'Please select both a district and a sector.',
    countryLabel: 'Country',
    selectCountryPlaceholder: 'Select Country',
    countrySearchPlaceholder: 'Search countries...',
    countryRequiredError: 'Please select a country.',
    regionLabel: 'State / Province / Region',
    selectRegionPlaceholder: 'Select State / Province / Region',
    regionSearchPlaceholder: 'Search states, provinces, or regions...',
    cityLabel: 'City',
    selectCityPlaceholder: 'Select City',
    citySearchPlaceholder: 'Search cities...',
    enterCityManually: 'Not listed? Enter city manually',
    manualCityPlaceholder: 'Enter city or town name',
    backToCityList: 'Choose from city list',
    loadingLocations: 'Loading locations...',
    cityRequiredError: 'Please select or enter a city.',
    phoneLabel: 'Phone Number',
    whatsappLabel: 'WhatsApp Number',
    whatsappHelp: 'Used to generate direct wa.me customer contact links.',
    emailLabel: 'Public Business Email (Optional)',
    handoffNoteLabel: 'Human Assistance Note',
    publishedLabel: 'Publish storefront to Customer Chat',
    publishedHelp: 'When enabled, customers can view this storefront and chat with its assistant without signing in.',
    draftStatusLabel: 'Private Draft',
    publishedStatusLabel: 'Published',
    saveChanges: 'Save Changes',
    savingChanges: 'Saving...',
    savedToast: 'Changes saved. Your business assistant now uses these updates.',
    deleteBusinessButton: 'Delete Business',
    confirmDeleteText: 'Click again to confirm deletion',
    addServiceButton: 'Add Service',
    serviceNamePlaceholder: 'Service name',
    servicePriceLabel: 'Price (RWF)',
    serviceDurationPlaceholder: 'Duration / unit',
    serviceDescPlaceholder: 'Brief description (optional)',
    removeService: 'Remove',
    sectionIdentity: 'Business Identity & Location',
    sectionContact: 'Contact & WhatsApp Handoff',
    sectionServices: 'Services & Prices (RWF)',
    sectionHours: 'Weekly Opening Hours',
    sectionWhatsAppApi: 'WhatsApp Business Integration',
    openLabel: 'Opens',
    closeLabel: 'Closes',
    errorLoadBusinesses: 'Could not load businesses right now.',
    errorChatFailed: 'Could not reach the assistant right now. Please try again.',
    privacyNote: 'Customer chat transcripts stay in browser memory only.',
    authGateTitle: 'Sign in to manage your businesses',
    authGateSubtitle:
      'Sign in with Google to register and manage your business workspaces. Customers can chat with published businesses without an account.',
    signInGoogleButton: 'Continue with Google',
    signingInButton: 'Signing in...',
    signOutButton: 'Sign Out',
    signedInAsLabel: 'Owner account',
    myBusinessesHeading: 'Your Businesses',
    noOwnedBusinessesYet:
      'Register your real business and enter its verified services, prices, hours, and contact details to get started.',
    publicGroupLabel: 'Live',
    waApiStatusConnected: 'WhatsApp Business API connected',
    waApiStatusNotConfigured: 'Direct WhatsApp link active (wa.me)',
    waWebhookUrlLabel: 'Webhook URL',
    waPhoneNumberIdLabel: 'WhatsApp Phone Number ID',
    waPhoneNumberIdHelp: 'Enter your WhatsApp Business Phone Number ID to connect incoming customer messages to this business.',
    waWebhookEnabledLabel: 'Enable automated WhatsApp replies for this business',
    waSaveIntegrationButton: 'Save WhatsApp Settings',
    waIntegrationSaved: 'WhatsApp settings saved.',
    waSimulatorTitle: 'Preview WhatsApp Assistant',
    waSimulatorPlaceholder: 'Type a customer question to preview...',
    waSimulatorRunButton: 'Test Reply',
    waSimulatorRunning: 'Testing...',
    waSimulatorNote: 'Send a sample customer message to preview how your assistant responds on WhatsApp.',
    waPreviewHumanHandoff: 'Human assistance suggested',
    waPreviewVerifiedReply: 'Verified business reply',
    days: {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    },
  },
  rw: {
    brandShort: 'ISHYA',
    brandName: 'ISHYA Business',
    tagline: 'Smarter Business. Better Connections.',
    navChat: 'Ikiganiro',
    navInfo: 'Amakuru',
    navDashboard: 'Igenamiterere',
    activeBusinessLabel: 'Ikigo gikoreshwa',
    languageLabel: 'Ururimi',
    noBusinessAddedTitle: 'Nta kigo kirongerwamo',
    noBusinessAddedBody:
      'Andikisha ikigo cyawe nyakuri maze ushyiremo serivisi, ibiciro, amasaha y’akazi, na WhatsApp byemejwe kugira ngo umufasha w’abakiriya atangire gukora.',
    addFirstBusinessButton: 'Ongeraho Ikigo Cyawe cya Mbere',
    chatWelcomeTitle: 'Baza serivisi, ibiciro, amasaha y’akazi, cyangwa aho duherereye',
    chatWelcomeBody:
      'Nsubiza nkurikije gusa amakuru nyakuri yanditswe kuri iki kigo mu Kinyarwanda, Icyongereza, cyangwa Igifaransa. Iyo amakuru atarimo, nguhuza n’umukozi.',
    chatPlaceholder: 'Andika ikibazo mu Kinyarwanda, Icyongereza, cyangwa Igifaransa...',
    sendButton: 'Ohereza',
    sendingButton: 'Birimo...',
    clearChat: 'Tangira bushya',
    quickPromptsLabel: 'Ibikunze kubazwa',
    quickPrompts: [
      'Mutanga izihe serivisi kandi ibiciro ni angahe?',
      'Mufungura ryari kandi mugafunga ryari?',
      'Muherereye he kandi nabavugisha nte?',
      'Nabavugisha nte imbonankubone?',
    ],
    humanAssistTitle: 'Ukeneye ubufasha bw’umukozi?',
    humanAssistDesc:
      'Ku makuru atagaragara hano cyangwa gufata gahunda (appointment) imbonankubone:',
    whatsappButton: 'Vugana kuri WhatsApp',
    whatsappDisclaimer: 'Ifungura WhatsApp kugira ngo wandikire ikigo (wa.me).',
    noWhatsappConfigured: 'Nta nimero ya WhatsApp irashyirwa kuri iki kigo.',
    verifiedInfoTitle: 'Amakuru yemejwe y’ikigo',
    servicesHeading: 'Serivisi n’Ibiciro',
    hoursHeading: 'Amasaha y’Akazi',
    locationHeading: 'Aho Biherereye',
    contactHeading: 'Uburyo bwo Kuvugana',
    closedLabel: 'Birafunze',
    noServicesEmpty: 'Nta serivisi zirasohoka. Ongeramo serivisi mu Igenamiterere.',
    dashboardTitle: 'Igenamiterere rya Nyir’ikigo',
    dashboardSubtitle:
      'Genzura amakuru y’ibigo byawe, serivisi, ibiciro, amasaha y’akazi, na WhatsApp.',
    isolationNote: 'Amakuru n’imbanzirizamushinga by’ikigo cyawe bireba konti yawe yonyine.',
    newBusinessButton: 'Ikigo Gishya',
    createBusinessTitle: 'Andikisha Ikigo Cyawe Nyakuri',
    createBusinessSubmit: 'Fungura Ikigo',
    cancelButton: 'Hagarika',
    businessNameLabel: 'Izina ry’Ikigo',
    categoryLabel: 'Icyiciro cy’Ubucuruzi',
    selectCategoryPlaceholder: 'Hitamo Icyiciro cy’Ubucuruzi',
    categorySearchPlaceholder: 'Shakisha icyiciro...',
    noCategoriesMatch: 'Nta cyiciro kibonetse',
    customCategoryPlaceholder: 'Andika icyiciro cy’ubucuruzi bwawe',
    categoryRequiredError: 'Nyamuneka hitamo icyiciro cy’ubucuruzi.',
    descriptionLabel: 'Ibisobanuro bigufi',
    addressLabel: 'Aderesi / Umuhanda',
    districtLabel: 'Akarere',
    sectorLabel: 'Umurenge',
    selectDistrictPlaceholder: 'Hitamo Akarere',
    selectSectorPlaceholder: 'Hitamo Umurenge',
    districtSearchPlaceholder: 'Shakisha akarere...',
    sectorSearchPlaceholder: 'Shakisha umurenge...',
    noLocationMatch: 'Nta hantu habonetse',
    locationRequiredError: 'Nyamuneka hitamo akarere n’umurenge.',
    countryLabel: 'Igihugu',
    selectCountryPlaceholder: 'Hitamo Igihugu',
    countrySearchPlaceholder: 'Shakisha igihugu...',
    countryRequiredError: 'Nyamuneka hitamo igihugu.',
    regionLabel: 'Intara / Akarere',
    selectRegionPlaceholder: 'Hitamo Intara / Akarere',
    regionSearchPlaceholder: 'Shakisha intara cyangwa akarere...',
    cityLabel: 'Umujyi',
    selectCityPlaceholder: 'Hitamo Umujyi',
    citySearchPlaceholder: 'Shakisha umujyi...',
    enterCityManually: 'Ntiwubonye? Andika umujyi',
    manualCityPlaceholder: 'Andika izina ry’umujyi',
    backToCityList: 'Hitamo ku rutonde rw’imijyi',
    loadingLocations: 'Birimo gushakishwa...',
    cityRequiredError: 'Nyamuneka hitamo cyangwa wandike umujyi.',
    phoneLabel: 'Nimero ya Telefone',
    whatsappLabel: 'Nimero ya WhatsApp',
    whatsappHelp: 'Ikoreshwa mu gukora umuyoboro wa wa.me uhuza umukiriya n’ikigo.',
    emailLabel: 'Imeri y’Ikigo (Si itegeko)',
    handoffNoteLabel: 'Ubutumwa bwo guhuza n’umukozi',
    publishedLabel: 'Garagariza abakiriya iki kigo',
    publishedHelp: 'Iyo bifunguye, abakiriya bashobora kuganira n’umufasha w’iki kigo batiriwe binjira muri konti.',
    draftStatusLabel: 'Imbanzirizamushinga (Ibanga)',
    publishedStatusLabel: 'Biragaragara',
    saveChanges: 'Bika Impinduka',
    savingChanges: 'Birabikwa...',
    savedToast: 'Impinduka zabitswe. Umufasha w’ikigo cyawe yahise atangira kuzikoresha.',
    deleteBusinessButton: 'Siba Ikigo',
    confirmDeleteText: 'Kanda nanone wemeze gusiba',
    addServiceButton: 'Ongeraho Serivisi',
    serviceNamePlaceholder: 'Izina rya serivisi',
    servicePriceLabel: 'Igiciro (RWF)',
    serviceDurationPlaceholder: 'Igihe cyangwa igipimo',
    serviceDescPlaceholder: 'Ibisobanuro bigufi (si itegeko)',
    removeService: 'Kura ho',
    sectionIdentity: 'Umwirondoro n’Aho Biherereye',
    sectionContact: 'Itumanaho na WhatsApp',
    sectionServices: 'Serivisi n’Ibiciro (RWF)',
    sectionHours: 'Amasaha y’Akazi mu Cyumweru',
    sectionWhatsAppApi: 'Ihuza rya WhatsApp Business',
    openLabel: 'Gufungura',
    closeLabel: 'Gufunga',
    errorLoadBusinesses: 'Ntibishobotse kubona amakuru ubu.',
    errorChatFailed: 'Ntibishobotse kubona igisubizo ubu. Ongera ugerageze.',
    privacyNote: 'Amagambo y’ikiganiro cy’umukiriya abikwa gusa muri mushakisha (browser).',
    authGateTitle: 'Injira muri konti kugira ngo ucunge ibigo byawe',
    authGateSubtitle:
      'Injira ukoresheje Google kugira ngo wandikishe kandi ucunge ibigo byawe. Abakiriya bo bakomeza kuganira n’ibigo byashyizwe ahagaragara batiriwe binjira.',
    signInGoogleButton: 'Injira ukoresheje Google',
    signingInButton: 'Birimo kwinjira...',
    signOutButton: 'Sohoka',
    signedInAsLabel: 'Konti ya nyir’ikigo',
    myBusinessesHeading: 'Ibigo Byawe',
    noOwnedBusinessesYet:
      'Andikisha ikigo cyawe nyakuri maze ushyiremo serivisi, ibiciro, amasaha y’akazi, n’uburyo bwo kuvugana byemejwe.',
    publicGroupLabel: 'Biriho',
    waApiStatusConnected: 'WhatsApp Business API irakora',
    waApiStatusNotConfigured: 'Umuyoboro wa WhatsApp (wa.me) urakora',
    waWebhookUrlLabel: 'URL ya Webhook',
    waPhoneNumberIdLabel: 'WhatsApp Phone Number ID',
    waPhoneNumberIdHelp: 'Shyiramo Phone Number ID ya WhatsApp Business kugira ngo ubutumwa bw’abakiriya bujye kuri iki kigo.',
    waWebhookEnabledLabel: 'Fungura ibisubizo bya WhatsApp kuri iki kigo',
    waSaveIntegrationButton: 'Bika Igenamiterere rya WhatsApp',
    waIntegrationSaved: 'Igenamiterere rya WhatsApp ryabitswe.',
    waSimulatorTitle: 'Reba uko WhatsApp isubiza',
    waSimulatorPlaceholder: 'Andika ikibazo cy’umukiriya kuri WhatsApp...',
    waSimulatorRunButton: 'Gerageza',
    waSimulatorRunning: 'Birimo...',
    waSimulatorNote: 'Andika ikibazo cy’umukiriya urebe uko umufasha wawe asubiza kuri WhatsApp.',
    waPreviewHumanHandoff: 'Bisaba ubufasha bw’umukozi',
    waPreviewVerifiedReply: 'Igisubizo cyemejwe cy’ikigo',
    days: {
      monday: 'Kuwa Mbere',
      tuesday: 'Kuwa Kabiri',
      wednesday: 'Kuwa Gatatu',
      thursday: 'Kuwa Kane',
      friday: 'Kuwa Gatanu',
      saturday: 'Kuwa Gatandatu',
      sunday: 'Ku Cyumweru',
    },
  },
  fr: {
    brandShort: 'ISHYA',
    brandName: 'ISHYA Business',
    tagline: 'Smarter Business. Better Connections.',
    navChat: 'Chat Client',
    navInfo: 'Infos Entreprise',
    navDashboard: 'Tableau de Bord',
    activeBusinessLabel: 'Entreprise active',
    languageLabel: 'Langue',
    noBusinessAddedTitle: 'Aucune entreprise ajoutée pour le moment',
    noBusinessAddedBody:
      'Enregistrez votre véritable entreprise et renseignez ses services, tarifs, horaires et coordonnées WhatsApp vérifiés pour activer votre assistant client.',
    addFirstBusinessButton: 'Ajouter Votre Première Entreprise',
    chatWelcomeTitle: 'Posez vos questions sur les services, tarifs, horaires ou adresse',
    chatWelcomeBody:
      'Je réponds uniquement à partir de la fiche vérifiée de cette entreprise en kinyarwanda, anglais ou français. Si une information manque, je propose une assistance humaine.',
    chatPlaceholder: 'Écrivez en kinyarwanda, anglais ou français...',
    sendButton: 'Envoyer',
    sendingButton: 'Envoi...',
    clearChat: 'Réinitialiser',
    quickPromptsLabel: 'Questions fréquentes',
    quickPrompts: [
      'Quels sont vos services et tarifs ?',
      'Quels sont vos horaires d’ouverture ?',
      'Où êtes-vous situés et comment vous contacter ?',
      'Comment contacter directement votre équipe ?',
    ],
    humanAssistTitle: 'Besoin d’un conseiller humain ?',
    humanAssistDesc:
      'Pour toute information absente de cette fiche ou pour réserver directement avec l’équipe :',
    whatsappButton: 'Discuter sur WhatsApp',
    whatsappDisclaimer: 'Ouvre WhatsApp directement pour contacter l’entreprise (lien wa.me).',
    noWhatsappConfigured: 'Aucun numéro WhatsApp n’est configuré pour cette entreprise.',
    verifiedInfoTitle: 'Fiche Entreprise Vérifiée',
    servicesHeading: 'Services & Tarifs',
    hoursHeading: 'Horaires d’ouverture',
    locationHeading: 'Localisation',
    contactHeading: 'Coordonnées',
    closedLabel: 'Fermé',
    noServicesEmpty: 'Aucun service enregistré. Ajoutez-en depuis le Tableau de Bord.',
    dashboardTitle: 'Tableau de Bord Propriétaire',
    dashboardSubtitle:
      'Gérez les informations, services, tarifs, horaires et coordonnées WhatsApp de vos entreprises.',
    isolationNote: 'Vos brouillons et paramètres d’entreprise restent privés sur votre compte.',
    newBusinessButton: 'Nouvelle Entreprise',
    createBusinessTitle: 'Enregistrer une Entreprise Vérifiée',
    createBusinessSubmit: 'Créer l’entreprise',
    cancelButton: 'Annuler',
    businessNameLabel: 'Nom de l’entreprise',
    categoryLabel: 'Catégorie',
    selectCategoryPlaceholder: 'Sélectionner une catégorie',
    categorySearchPlaceholder: 'Rechercher une catégorie...',
    noCategoriesMatch: 'Aucune catégorie trouvée',
    customCategoryPlaceholder: 'Saisissez votre catégorie d’entreprise',
    categoryRequiredError: 'Veuillez sélectionner une catégorie d’entreprise.',
    descriptionLabel: 'Description courte',
    addressLabel: 'Adresse / Rue',
    districtLabel: 'District',
    sectorLabel: 'Secteur',
    selectDistrictPlaceholder: 'Sélectionner un district',
    selectSectorPlaceholder: 'Sélectionner un secteur',
    districtSearchPlaceholder: 'Rechercher un district...',
    sectorSearchPlaceholder: 'Rechercher un secteur...',
    noLocationMatch: 'Aucun emplacement trouvé',
    locationRequiredError: 'Veuillez sélectionner un district et un secteur.',
    countryLabel: 'Pays',
    selectCountryPlaceholder: 'Sélectionner un pays',
    countrySearchPlaceholder: 'Rechercher un pays...',
    countryRequiredError: 'Veuillez sélectionner un pays.',
    regionLabel: 'État / Province / Région',
    selectRegionPlaceholder: 'Sélectionner État / Province / Région',
    regionSearchPlaceholder: 'Rechercher un État ou une région...',
    cityLabel: 'Ville',
    selectCityPlaceholder: 'Sélectionner une ville',
    citySearchPlaceholder: 'Rechercher une ville...',
    enterCityManually: 'Introuvable ? Saisir la ville manuellement',
    manualCityPlaceholder: 'Saisissez le nom de la ville',
    backToCityList: 'Choisir dans la liste des villes',
    loadingLocations: 'Chargement...',
    cityRequiredError: 'Veuillez sélectionner ou saisir une ville.',
    phoneLabel: 'Téléphone',
    whatsappLabel: 'Numéro WhatsApp',
    whatsappHelp: 'Utilisé pour générer un lien direct wa.me vers votre équipe.',
    emailLabel: 'E-mail public (Optionnel)',
    handoffNoteLabel: 'Message d’assistance humaine',
    publishedLabel: 'Publier dans le Chat Client',
    publishedHelp: 'Une fois activé, les clients peuvent consulter cette fiche et discuter avec son assistant sans se connecter.',
    draftStatusLabel: 'Brouillon privé',
    publishedStatusLabel: 'Publiée',
    saveChanges: 'Enregistrer',
    savingChanges: 'Enregistrement...',
    savedToast: 'Modifications enregistrées. Votre assistant utilise immédiatement ces mises à jour.',
    deleteBusinessButton: 'Supprimer',
    confirmDeleteText: 'Cliquer encore pour confirmer',
    addServiceButton: 'Ajouter un service',
    serviceNamePlaceholder: 'Nom du service',
    servicePriceLabel: 'Tarif (RWF)',
    serviceDurationPlaceholder: 'Durée ou unité',
    serviceDescPlaceholder: 'Brève description (optionnel)',
    removeService: 'Retirer',
    sectionIdentity: 'Identité & Localisation',
    sectionContact: 'Contact & Relais WhatsApp',
    sectionServices: 'Services & Tarifs (RWF)',
    sectionHours: 'Horaires Hebdomadaires',
    sectionWhatsAppApi: 'Intégration WhatsApp Business',
    openLabel: 'Ouverture',
    closeLabel: 'Fermeture',
    errorLoadBusinesses: 'Impossible de charger les entreprises pour le moment.',
    errorChatFailed: 'Assistant indisponible pour le moment. Veuillez réessayer.',
    privacyNote: 'Les conversations clients restent uniquement en mémoire locale du navigateur.',
    authGateTitle: 'Connectez-vous pour gérer vos entreprises',
    authGateSubtitle:
      'Connectez-vous avec Google pour enregistrer et gérer vos entreprises. Les clients peuvent discuter avec les entreprises publiées sans compte.',
    signInGoogleButton: 'Continuer avec Google',
    signingInButton: 'Connexion...',
    signOutButton: 'Se déconnecter',
    signedInAsLabel: 'Compte propriétaire',
    myBusinessesHeading: 'Vos Entreprises',
    noOwnedBusinessesYet:
      'Enregistrez votre entreprise et renseignez ses services, tarifs, horaires et coordonnées vérifiés pour commencer.',
    publicGroupLabel: 'Publiée',
    waApiStatusConnected: 'WhatsApp Business API connectée',
    waApiStatusNotConfigured: 'Lien direct WhatsApp actif (wa.me)',
    waWebhookUrlLabel: 'URL de Webhook',
    waPhoneNumberIdLabel: 'WhatsApp Phone Number ID',
    waPhoneNumberIdHelp: 'Indiquez votre Phone Number ID WhatsApp Business pour relier les messages clients à cette entreprise.',
    waWebhookEnabledLabel: 'Activer les réponses WhatsApp automatisées pour cette entreprise',
    waSaveIntegrationButton: 'Enregistrer les paramètres WhatsApp',
    waIntegrationSaved: 'Paramètres WhatsApp enregistrés.',
    waSimulatorTitle: 'Aperçu de l’assistant WhatsApp',
    waSimulatorPlaceholder: 'Saisissez une question client à prévisualiser...',
    waSimulatorRunButton: 'Tester',
    waSimulatorRunning: 'Test en cours...',
    waSimulatorNote: 'Envoyez un exemple de question client pour prévisualiser la réponse sur WhatsApp.',
    waPreviewHumanHandoff: 'Assistance humaine conseillée',
    waPreviewVerifiedReply: 'Réponse vérifiée de l’entreprise',
    days: {
      monday: 'Lundi',
      tuesday: 'Mardi',
      wednesday: 'Mercredi',
      thursday: 'Jeudi',
      friday: 'Vendredi',
      saturday: 'Samedi',
      sunday: 'Dimanche',
    },
  },
};
