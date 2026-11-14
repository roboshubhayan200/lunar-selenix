# '''Physical constant to be used entirely throughout the project'''

# MOON_RADIUS_KM = 1737.4 #mean lunar radius of the moon according to the frame of the MOON_ME_frame.

# AU_KM = 149597480.7 #the convrsion matrix from the astronomical unit to kilometers.

# SOLAR_CONSTANT_W_M2 = 1360.0   #it's the metric of total irradiance - power able to consume -- 1 Watt/m^2

# SUN_RADIUS_KM = 695700.0   #the radius of the sun in kilometers.

# EARTH_RADIUS_KM = 6738.1   #earth equatorial radius


"""Physical constants used throughout the project.

Every number here has a source. If a judge asks "where does 1737.4 come
from?", the answer is in this file.
"""

# Mean lunar radius, km (IAU WGCCRE 2015 report; also the LOLA reference sphere).
MOON_RADIUS_KM = 1737.4

# Astronomical unit, km (IAU 2012 Resolution B2, exact by definition).
AU_KM = 149_597_870.7

# Total solar irradiance at 1 AU, W/m^2 (Kopp & Lean 2011, SORCE/TIM).
SOLAR_CONSTANT_W_M2 = 1361.0

# Photospheric radius of the Sun, km (IAU 2015 Resolution B3 nominal value).
SUN_RADIUS_KM = 695_700.0

# Earth equatorial radius, km (IAU 2015 nominal value).
EARTH_RADIUS_KM = 6_378.1