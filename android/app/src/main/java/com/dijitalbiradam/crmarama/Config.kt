package com.dijitalbiradam.crmarama

object Config {
    const val SUPABASE_URL = "https://unlcqrfaawhqzkgwzdbu.supabase.co"
    // Herkese açık (publishable) anahtar: tek başına veri okutmaz, yetkiyi kullanıcı girişi verir
    const val PUBLISHABLE_KEY = "sb_publishable_CTKEuIU0LnDxZfmL_PnySA_ea2cuZM3"
    const val COMPANY = "dijitalbiradam"
    const val CRM_WEB = "https://crm.dijitalbiradam.com"
    /** İlk girişte geriye dönük kaç günlük arama gönderilsin */
    const val INITIAL_DAYS = 3
}
