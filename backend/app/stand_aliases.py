"""Manual links between route place names and bus stand records.

Route sheets use short or colloquial names ("Howrah Railway Station", "Dunlop", "Ruby").
Each key is a lower-cased stop name (after removing a trailing "(via ...)" note) and each value
must be the exact `name` of a row in Kolkata_Bus_Stands_v2.xlsx.

Only clear matches are listed. Anything not listed keeps `bus_stand_id = NULL` and can be
linked later through the data (or an admin tool) once confirmed.
"""

STAND_ALIASES: dict[str, str] = {
    # Howrah
    "howrah railway station": "Howrah Station Central Stand",
    "howrah bus terminus": "Howrah Station Central Stand",
    "howrah stn": "Howrah Station Central Stand",
    # Central / south
    "esplanade": "Esplanade Bus Terminus",
    "esplanade curzon park": "Esplanade Bus Terminus",
    "babughat": "Babughat Bus Terminus",
    "babughat terminus": "Babughat Bus Terminus",
    "strand road": "Babughat Bus Terminus",
    "baghbazar street": "Baghbazar Launch Ghat Stand",
    "bbd bag": "B.B.D. Bag (Dalhousie) Square",
    "sealdah": "Sealdah Railway Station Stand",
    "sealdah railway station": "Sealdah Railway Station Stand",
    "gariahat": "Gariahat Crossing & Tram Stand",
    "gariahat crossing": "Gariahat Crossing & Tram Stand",
    "hazra": "Hazra More Crossing",
    "dunlop": "Dunlop Bridge Crossing",
    "shyambazar": "Shyambazar 5-Point Crossing",
    "shyambazar 5-point": "Shyambazar 5-Point Crossing",
    "ultadanga": "Ultadanga / HUDCO Crossing",
    "ultadanga / hudco": "Ultadanga / HUDCO Crossing",
    "vidyasagar setu": "Vidyasagar Setu SBSTC Terminal",
    "science city": "Science City Crossing",
    "chingrighata": "Chingrighata Crossing",
    "ruby": "Ruby Hospital / GST Bhawan",
    "ruby hospital": "Ruby Hospital / GST Bhawan",
    "park circus 7-point": "Park Circus 7-Point Stand",
    "kamalgazi": "Kamalgazi More",
    "kamalgazi stand": "Kamalgazi More",
    # Airport / north
    "airport gate 1": "Airport Gate No. 1 / 3 Stand",
    "dakshineswar bus stand": "Dakshineswar Bus Terminus",
    "dakshineswar stand": "Dakshineswar Bus Terminus",
    "golf green": "Golf Green Bus Terminus",
    "sarsuna bus stand": "Sarsuna Bus Terminus",
    "baruipur bus terminus": "Baruipur Fultala Central Terminus",
    "bally khal": "Bally Khal Bus Terminus",
    "santragachi railway terminal": "Santragachi Bus Terminus",
    "sapoorji / new town": "Shapoorji Depot",
    "new town action area iii": "Shapoorji Depot",
    # South
    "behala 14 no": "Behala 14 No. Bus Terminus",
    "behala 14 no. stand": "Behala 14 No. Bus Terminus",
    "behala sakuntala park": "Sakuntala Park Bus Stand",
    "jadavpur 8b terminus": "Jadavpur 8B Bus Terminus",
    "karunamoyee": "Karunamoyee Bus Terminus",
    "karunamoyee (salt lake)": "Karunamoyee Bus Terminus",
    "salt lake karunamoyee": "Karunamoyee Bus Terminus",
    "kudghat bus stand": "Kudghat Bus Terminus",
    "parnasree pally": "Parnasree Lake Stand",
    "thakurpukur 3a stand": "Thakurpukur 3A Bus Stand",
    "budge budge / batanagar": "Eden City / Budge Budge Stand",
    "shalimar station": "Shalimar Bus Terminus",
}
