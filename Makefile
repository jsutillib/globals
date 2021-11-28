current_dir = $(notdir $(shell pwd))
build:
ifneq ("","$(wildcard js/*.js)")
	uglifyjs js/*.js -o jsutillib-$(current_dir).min.js
endif
ifneq ("","$(wildcard css/*.css)")
	uglifycss css/*.css > jsutillib-$(current_dir).min.css
endif

clean:
	echo rm -f jsutillib-$(current_dir).min.js jsutillib-$(current_dir).min.css