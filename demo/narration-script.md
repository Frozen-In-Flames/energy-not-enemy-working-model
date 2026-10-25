# Narration script: Energy Not Enemy, The Working Model

Presentation walkthrough, final cut 3 minutes 14 seconds.
Plain language throughout. The voice track in the shipped video was
recorded from these words in a separate finishing pass (this build
environment has no speech synthesis), placed line by line at each
scene's appearance, with the same words carried as on-screen captions.
The spoken lines for section four follow the fallback text below the
cut note, matching what the recording could actually show.

Cut note: in the shipped recording, section four shows the bundled
Lewisville year's analysis instead of the Phoenix fetch described in
lines 16 and 17. The recording browser could not reach the public
internet at all, so the live fetch was attempted, failed, and the cut
says so on screen. Lines 16 and 17 are the script for the re-shoot,
which `demo/capture.mjs` performs automatically wherever the browser can
reach the weather archive.

## Opening (title card)

1. "Energy Not Enemy: The Working Model. This is a working simulation of a
   solar steam generator, one that makes electricity from sunlight, water,
   and a lens, with no solar panels anywhere in it."

## Section one: the machine and its parts

2. "Here is the whole plant. Every part you can see was generated from the
   dimensions in the book that describes this machine."
3. "The big grid is the Fresnel lens array, forty square metres of lens in
   forty panels. It does not make electricity. It only gathers sunlight and
   squeezes it onto one small spot."
4. "That spot is the receiver, and right behind it sits the boiler, a sealed
   steel vessel holding the water the whole loop runs on."
5. "This is the Tesla valve, a flow channel with no moving parts, shown cut
   open. It lets steam through easily one way and resists it the other way."
6. "The steam spins this turbine, the turbine shaft turns the generator, and
   the generator is what finally makes electricity."
7. "The last part is the condenser, a bank of air cooled panels where used
   steam gives up its heat and turns back into water."

## Section two: the day shift, phase by phase

8. "Now watch a full day on real measured weather, the best day of the year
   for Lewisville, Texas. The panel on the right measures the energy at
   every phase as it happens."
9. "Morning sun lands on the lens. Watch phase one and two: sunlight in,
   then concentrated heat, focused down by a factor of sixty onto the
   receiver."
10. "The boiler climbs toward its design point, four megapascals and four
    hundred degrees. When the water inside crosses boiling at that
    pressure, steam forms. Phase three shows the steam enthalpy rising."
11. "The steam reaches the turbine through the valve. Phase four is the
    valve pass, phase five is shaft power, and you can see the turbine
    spinning at the speed the physics says, a few thousand rpm."
12. "Phase six is the point of the whole machine: electricity out, a little
    under five kilowatts at the peak of this day. Nothing here is animated
    for show. When the solver says zero flow, the motion stops."

## Section three: the night shift, and the water coming home

13. "When the sun goes down, the lens goes quiet and the plant runs on the
    steam it banked, until the pressure fades."
14. "What is left drifts to the condenser, cools, and turns back into
    liquid. Watch the droplets, and watch the water level make its way back
    to the boiler side."
15. "By morning the loop is liquid, sealed, and counted. Over this whole
    day, and over the full year of weather in the model, the water gained
    or lost is zero kilograms, exactly what the book claims, tested here as
    accounting inside a sealed boundary."

## Section four: changing the city and the time span

16. "The machine does not change. The weather does. Here the same plant is
    picked up and set down in Phoenix, Arizona, and the app fetches a full
    year of real hourly weather for that spot."
17. "Same lens, same boiler, same turbine, different sky. The heatmap shows
    the shape of the year, output by hour and by month, and the table
    compares the places side by side."

## Section five: the totals, and what they mean

18. "So what does it add up to? On this best day the model made about forty
    kilowatt hours, and across the full Lewisville year, about nine
    thousand three hundred, a capacity factor of about fifteen percent."
19. "The book's own reference arithmetic says twenty seven point six
    kilowatt hours on its design day. Running continuously, the model
    lands within about an eighth of that. From a cold start it lands
    lower, and the claims table in the app says so openly, with the
    reasons."
20. "Everything you have seen comes from one document, the book Energy Not
    Enemy by Aries Hilton. The book is included in this project, free to
    read, and it is the specification this simulation was built and checked
    against."
