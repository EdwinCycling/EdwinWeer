**Directions Service**

Get directions for different modes of transport

/v2/directions/{profile}

**GET**

**Directions Service**

navigate_next

lock**Query-ParameterAuthorization-Header**

Get a basic route between two points with the profile provided. Returned response is in GeoJSON format. This method does not accept any request body or parameters other than profile, start coordinate, and end coordinate.

**/v2/directions/{profile}**

lock

**Query-Parameter  
api_key parameter needed for authentication**

get

**https://api.openrouteservice.org**/v2/directions/driving-car?api_key=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=&start=8.681495,49.41461&end=8.687872,49.420318

Top of Form

**\*** means it is required

**df** means default value

**Key**

**Value**

**Help**

api_key \*

(string) df.: eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=

eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=

help

start \*

(string) eg.: 8.681495,49.41461

help

end \*

(string) eg.: 8.687872,49.420318

help

Bottom of Form

Example language

cURL

**curl \--include \\**

**\--header \"Content-Type: application/json; charset=utf-8\" \\**

**\--header \"Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8\" \\**

**\'https://api.openrouteservice.org/v2/directions/driving-car?api_key=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=&start=8.681495,49.41461&end=8.687872,49.420318\'**

**Directions Service JSON**

**/v2/directions/{profile}/json**

lock

**Authorization-Header  
Authorization header needed for authentication**

post

**https://api.openrouteservice.org**/v2/directions/driving-car/json

Top of Form

(object)

**\*** means it is required

**df** means default value

**Key**

**Value**

**Help**

coordinates \*

(array) eg.: \[\[8.681495,49.41461\],\[8.686507,49.41943\],\[8.687872,49.420318\]\]

help

alternative_routes

(object) eg.: {\"target_count\":2,\"weight_factor\":1.6}

help

attributes

(array) eg.: \[\"avgspeed\",\"percentage\"\]

help

continue_straight

(boolean) df.: false

help

custom_model

(object) eg.: {\"speed\":\[{\"if\":true,\"limit_to\":100}\],\"priority\":\[{\"if\":\"road_class == MOTORWAY\",\"multiply_by\":0}\],\"distance_influence\":100}

help

elevation

(boolean) eg.: false

help

extra_info

(array) eg.: \[\"waytype\",\"surface\"\]

help

geometry_simplify

(boolean) df.: false

help

id

(string) eg.: my_request

help

instructions

(boolean) df.: true

help

instructions_format

(string) df.: text

help

language

(string) df.: en

help

maneuvers

(boolean) df.: false

help

options

(object) eg.: {\"avoid_borders\":\"controlled\"}

help

preference

(string) df.: recommended

help

radiuses

(array) eg.: \[200,-1,30\]

help

roundabout_exits

(boolean) df.: false

help

skip_segments

(array) eg.: \[2,4\]

help

suppress_warnings

(boolean) eg.: false

help

units

(string) df.: m

help

geometry

(boolean) df.: true

help

maximum_speed

(number) eg.: 90

help

- disabled_visible Disabled fields for this parameter configuration : 1

keyboard_arrow_down

Bottom of Form

Example language

cURL

**curl -X POST \\**

**\'https://api.openrouteservice.org/v2/directions/driving-car/json\' \\**

**-H \'Content-Type: application/json; charset=utf-8\' \\**

**-H \'Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8\' \\**

**-H \'Authorization: eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=\' \\**

**-d \'{\"coordinates\":\[\[8.681495,49.41461\],\[8.686507,49.41943\],\[8.687872,49.420318\]\]}\'**

**Directions Service GPX**

**/v2/directions/{profile}/gpx**

lock

**Authorization-Header  
Authorization header needed for authentication**

post

**https://api.openrouteservice.org**/v2/directions/driving-car/gpx

Top of Form

(object)

**\*** means it is required

**df** means default value

**Key**

**Value**

**Help**

coordinates \*

(array) eg.: \[\[8.681495,49.41461\],\[8.686507,49.41943\],\[8.687872,49.420318\]\]

help

alternative_routes

(object) eg.: {\"target_count\":2,\"weight_factor\":1.6}

help

attributes

(array) eg.: \[\"avgspeed\",\"percentage\"\]

help

continue_straight

(boolean) df.: false

help

custom_model

(object) eg.: {\"speed\":\[{\"if\":true,\"limit_to\":100}\],\"priority\":\[{\"if\":\"road_class == MOTORWAY\",\"multiply_by\":0}\],\"distance_influence\":100}

help

elevation

(boolean) eg.: false

help

extra_info

(array) eg.: \[\"waytype\",\"surface\"\]

help

geometry_simplify

(boolean) df.: false

help

id

(string) eg.: my_request

help

instructions

(boolean) df.: true

help

instructions_format

(string) df.: text

help

language

(string) df.: en

help

maneuvers

(boolean) df.: false

help

options

(object) eg.: {\"avoid_borders\":\"controlled\"}

help

preference

(string) df.: recommended

help

radiuses

(array) eg.: \[200,-1,30\]

help

roundabout_exits

(boolean) df.: false

help

skip_segments

(array) eg.: \[2,4\]

help

suppress_warnings

(boolean) eg.: false

help

units

(string) df.: m

help

geometry

(boolean) df.: true

help

maximum_speed

(number) eg.: 90

help

- disabled_visible Disabled fields for this parameter configuration : 1

keyboard_arrow_down

Bottom of Form

Example language

cURL

**curl -X POST \\**

**\'https://api.openrouteservice.org/v2/directions/driving-car/gpx\' \\**

**-H \'Content-Type: application/json; charset=utf-8\' \\**

**-H \'Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8\' \\**

**-H \'Authorization: eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=\' \\**

**-d \'{\"coordinates\":\[\[8.681495,49.41461\],\[8.686507,49.41943\],\[8.687872,49.420318\]\]}\'**

**Directions Service GeoJSON**

**/v2/directions/{profile}/geojson**

lock

**Authorization-Header  
Authorization header needed for authentication**

post

**https://api.openrouteservice.org**/v2/directions/driving-car/geojson

Top of Form

(object)

**\*** means it is required

**df** means default value

**Key**

**Value**

**Help**

coordinates \*

(array) eg.: \[\[8.681495,49.41461\],\[8.686507,49.41943\],\[8.687872,49.420318\]\]

help

alternative_routes

(object) eg.: {\"target_count\":2,\"weight_factor\":1.6}

help

attributes

(array) eg.: \[\"avgspeed\",\"percentage\"\]

help

continue_straight

(boolean) df.: false

help

custom_model

(object) eg.: {\"speed\":\[{\"if\":true,\"limit_to\":100}\],\"priority\":\[{\"if\":\"road_class == MOTORWAY\",\"multiply_by\":0}\],\"distance_influence\":100}

help

elevation

(boolean) eg.: false

help

extra_info

(array) eg.: \[\"waytype\",\"surface\"\]

help

geometry_simplify

(boolean) df.: false

help

id

(string) eg.: my_request

help

instructions

(boolean) df.: true

help

instructions_format

(string) df.: text

help

language

(string) df.: en

help

maneuvers

(boolean) df.: false

help

options

(object) eg.: {\"avoid_borders\":\"controlled\"}

help

preference

(string) df.: recommended

help

radiuses

(array) eg.: \[200,-1,30\]

help

roundabout_exits

(boolean) df.: false

help

skip_segments

(array) eg.: \[2,4\]

help

suppress_warnings

(boolean) eg.: false

help

units

(string) df.: m

help

geometry

(boolean) df.: true

help

maximum_speed

(number) eg.: 90

help

- disabled_visible Disabled fields for this parameter configuration : 1

keyboard_arrow_down

Bottom of Form

Example language

cURL

**curl -X POST \\**

**\'https://api.openrouteservice.org/v2/directions/driving-car/geojson\' \\**

**-H \'Content-Type: application/json; charset=utf-8\' \\**

**-H \'Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8\' \\**

**-H \'Authorization: eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRmZDEwZGMyODZkZDQzYzU5Nzk0YzRjMzBhNDMyY2YwIiwiaCI6Im11cm11cjY0In0=\' \\**

**-d \'{\"coordinates\":\[\[8.681495,49.41461\],\[8.686507,49.41943\],\[8.687872,49.420318\]\]}\'**

 © 2026 **openrouteservice** \| Services developed by [**The Heidelberg Institute for Geoinformation Technology**](http://www.heigit.org/) \| [Update cookie p](https://openrouteservice.org/dev/)

**Export Service**

**/v2/export/{profile}**

lock

**Authorization-Header  
Authorization header needed for authentication**

post

**https://api.openrouteservice.org**/v2/export/{profile}

Top of Form

(object)

**\*** means it is required

**df** means default value

**Key**

**Value**

**Help**

bbox \*

(array) eg.: \[\[8.681495,49.41461\],\[8.686507,49.41943\]\]

help

id

(string) eg.: export_request

help

geometry

(boolean) df.: true

help

Bottom of Form

Example language

cURL

**curl -X POST \\**

**\'https://api.openrouteservice.org/v2/export/{profile}\' \\**

**-H \'Content-Type: application/json; charset=utf-8\' \\**

**-H \'Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8\' \\**

**-H \'Authorization: undefined\' \\**

**-d \'{}\'**

**Export Service JSON**

**/v2/export/{profile}/json**

lock

**Authorization-Header  
Authorization header needed for authentication**

post

**https://api.openrouteservice.org**/v2/export/{profile}/json

Top of Form

(object)

**\*** means it is required

**df** means default value

**Key**

**Value**

**Help**

bbox \*

(array) eg.: \[\[8.681495,49.41461\],\[8.686507,49.41943\]\]

help

id

(string) eg.: export_request

help

geometry

(boolean) df.: true

help

Bottom of Form

Example language

cURL

**curl -X POST \\**

**\'https://api.openrouteservice.org/v2/export/{profile}/json\' \\**

**-H \'Content-Type: application/json; charset=utf-8\' \\**

**-H \'Accept: application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8\' \\**

**-H \'Authorization: undefined\' \\**

**-d \'{}\'**
