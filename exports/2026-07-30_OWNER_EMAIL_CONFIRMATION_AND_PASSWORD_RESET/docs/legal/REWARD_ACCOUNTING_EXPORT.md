# Interner Bonus-Aktivitätsexport

Der bestehende technische RPC `get_reward_accounting_export` bleibt als
Kompatibilitätsvertrag erhalten. Er liefert nach Einführung des V1-Journals
ausschließlich Daten aus dem unveränderbaren Bonus-Aktivitätsprotokoll.

Der Owner-Export enthält, soweit historisch sicher vorhanden:

- WUXUAI-Aktivitätsnummer
- Restaurant-, Filial- und Rewardbezug
- Rewardname zum Einlösezeitpunkt
- verbrauchte Punkte
- Menge
- Einlösezeitpunkt und Status
- ausführende Rolle
- maskierte Einlösereferenz statt vollständigem sechsstelligen Code
- Stornozeitpunkt und Stornogrund
- Snapshotstatus
- Audit-Event-ID

Historische Werte werden nicht aus heutigen Reward-Stammdaten rekonstruiert.
Fehlende Altdaten bleiben leer und werden als `partial_legacy` oder
`missing_source_data` gekennzeichnet. Testkundendaten sind standardmäßig
ausgeschlossen.

> Dieser Bericht dokumentiert ausschließlich Aktivitäten des WUXUAI
> Bonusprogramms. Er ist kein Kassenbeleg, keine Registrierkasse und keine
> steuerliche oder buchhalterische Aufzeichnung. Die ordnungsgemäße Erfassung
> steuerlich, buchhalterisch oder kassentechnisch relevanter Vorgänge im eigenen
> Kassensystem obliegt dem Restaurantbetreiber.

Status des Rechtstexts: `LEGAL_REVIEW_REQUIRED`.
