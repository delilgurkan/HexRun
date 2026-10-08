package co.hexrun.core.i18n

/**
 * Türkçe sayı ekleri. Sayının okunuşundaki son sözcüğe göre ünlü uyumu:
 * 14'ü (on dört), 48'i (kırk sekiz), 2'si (iki), 6'sı (altı), 10'u (on).
 */
object TrGrammar {
    // (ünlüyle bitiyor mu, iyelik ünlüsü)
    private val DIGITS = mapOf(1 to (false to 'i'), 2 to (true to 'i'), 3 to (false to 'ü'), 4 to (false to 'ü'), 5 to (false to 'i'), 6 to (true to 'ı'), 7 to (true to 'i'), 8 to (false to 'i'), 9 to (false to 'u'))
    private val TENS = mapOf(1 to (false to 'u'), 2 to (true to 'i'), 3 to (false to 'u'), 4 to (false to 'ı'), 5 to (true to 'i'), 6 to (false to 'ı'), 7 to (false to 'i'), 8 to (false to 'i'), 9 to (false to 'ı'))

    private fun lastWord(n: Long): Pair<Boolean, Char> {
        val a = kotlin.math.abs(n)
        return when {
            a == 0L -> false to 'ı' // sıfır
            a % 10 != 0L -> DIGITS.getValue((a % 10).toInt())
            a % 100 != 0L -> TENS.getValue(((a / 10) % 10).toInt())
            a % 1000 != 0L -> false to 'ü' // yüz
            a % 1_000_000 != 0L -> false to 'i' // bin
            else -> false to 'u' // milyon
        }
    }

    /** 3. tekil iyelik eki: "14'ü", "2'si" (apostrofsuz ek döner: "ü", "si"). */
    fun possessive(n: Int): String = lastWord(n.toLong()).let { (vowel, v) -> if (vowel) "s$v" else "$v" }
}
