var CSLValidator = (function() {

    //to access URL parameters
    var uri;

    //required for highlighting in ace editor
    var Range;

    //keep track of source code highlighting, so we can remove prior highlighting
    //when selecting a different error
    var marker;

    var validateButton;

    //keep track of how much time validator.nu is taking
    var responseTimer;
    var responseMaxTime = 6000; //in milliseconds
    var responseStartTime;
    var responseEndTime;

    var init = function() {

        //Initialize URI.js
        uri = new URI();

        //Create range for Ace editor
        Range = ace.require("ace/range").Range;

        //Initialize Ladda button
        validateButton = Ladda.create(document.querySelector('#validate'));

        //set schema-version if specified
        if (uri.hasQuery('version')) {
          var setSchemaVersion = uri.query(true)['version'];

          //http://stackoverflow.com/a/2248991/1712389
          $('#schema-version option').each(function() {
              if (this.value == setSchemaVersion) {
                  $("#schema-version").val(setSchemaVersion);
                  return false;
              }
          });
        }

        //run validation if URL parameters includes URL
        if (uri.hasQuery('url')) {
            var setURL = uri.query(true)['url'];
            $("#source-url").val(setURL);
            validate();
        }

        //update page for selected input method
        $("#source-method").change(function() {
            var sourceMethod = this.value;
            adaptToSourceMethod(sourceMethod);
        });

        //validate on button click
        $("#validate").click(validate);

        //validate when pressing Enter in URL text field
        $('#source-url').keydown(function(event) {
            if (event.keyCode == 13) {
                event.preventDefault();
                validate();
            }
        });
    };

    var adaptToSourceMethod = function(sourceMethod) {
        var inputField = "";

        switch (sourceMethod) {
            case "url":
                inputField = '<input id="source-url" class="form-control source-input">';
                break;
            case "file-upload":
                inputField = '<input id="source-file" class="source-input" type="file">';
                break;
            case "textarea":
                inputField = '<textarea id="source-text" class="form-control source-input" rows="15"></textarea>';
                break;
        }

        $(".source-input").replaceWith(inputField);
    };

    function validate() {

        removeValidationResults();

        validateButton.start();

        responseStartTime = new Date();
        responseTimer = window.setTimeout(reportTimeOut, responseMaxTime);

        var schemaURL = "https://raw.githubusercontent.com/citation-style-language/schema/v" + $('#schema-version').val() + "/csl.rnc";
        schemaURL += " " + "https://raw.githubusercontent.com/citation-style-language/schema/master/csl.sch";

        var sourceMethod = $('#source-method').val();

        switch (sourceMethod) {
            case "url":
                var documentURL = $('#source-url').val();

                uri.setSearch("url", documentURL);
                uri.setSearch("version", $('#schema-version').val());
                history.pushState({}, document.title, uri);

                //don't try validation on empty string
                if ($.trim(documentURL).length > 0) {
                    validateViaGET(schemaURL, documentURL);
                } else {
                    window.clearTimeout(responseTimer);
                    validateButton.stop();
                }

                break;
            case "file-upload":
                uri.search("");
                history.pushState({}, document.title, uri);

                var documentFile = $('#source-file').get(0).files[0];
                validateViaPOST(schemaURL, documentFile, sourceMethod);
                break;
            case "textarea":
                uri.search("");
                history.pushState({}, document.title, uri);

                var documentContent = $('#source-text').val();
                validateViaPOST(schemaURL, documentContent, sourceMethod);
                break;
        }
    }

    function validateViaGET(schemaURL, documentURL) {
        $.get("http://validator.w3.org/nu/", {
                doc: documentURL,
                schema: schemaURL,
                parser: "xml",
                laxtype: "yes",
                level: "error",
                out: "json",
                showsource: "yes"
            })
            .done(function(data) {
                parseResponse(data);
            });
    }

    function validateViaPOST(schemaURL, documentContent, sourceMethod) {
        var formData = new FormData();
        formData.append("schema", schemaURL);
        formData.append("parser", "xml");
        formData.append("laxtype", "yes");
        formData.append("level", "error");
        formData.append("out", "json");
        formData.append("showsource", "yes");

        if (sourceMethod == "textarea") {
            formData.append("content", documentContent);
        } else {
            formData.append("file", documentContent);
        }

        $.ajax({
            type: "POST",
            url: "http://validator.w3.org/nu/",
            data: formData,
            success: function(data) {
                parseResponse(data);
            },
            processData: false,
            contentType: false
        });
    }

    function parseResponse(data) {
        //console.log(JSON.stringify(data));

        window.clearTimeout(responseTimer);
        responseEndTime = new Date();
        console.log("Received response from http://validator.w3.org/nu/ after " + (responseEndTime - responseStartTime) + "ms");

        removeValidationResults();

        var messages = data.messages;
        var errorCount = 0;
        var nonDocumentError = "";
        for (var i = 0; i < messages.length; i++) {
            if (messages[i].type == "non-document-error") {
                nonDocumentError = messages[i].message;
            } else if (messages[i].type == "error") {
                errorCount += 1;

                var results = "";
                results += '<li class="inserted">';

                var range = "";
                var firstLine = "";
                var lineText = "";
                var lastLine = messages[i].lastLine;
                var firstColumn = messages[i].firstColumn;
                var lastColumn = messages[i].lastColumn;
                if (messages[i].hasOwnProperty('firstLine')) {
                    firstLine = messages[i].firstLine;
                    range = firstLine + "-" + lastLine;
                    lineText = "Lines " + range;
                } else {
                    firstLine = lastLine;
                    lineText = "Line " + lastLine;
                }
                sourceHighlightRange = firstLine + ',' + firstColumn + ',' + lastLine + ',' + lastColumn;
                results += '<a href="#source-code" onclick="CSLValidator.moveToLine(' + sourceHighlightRange + ');">' + lineText + '</a>: ';

                results += messages[i].message;
                results += '<div id="error-' + errorCount + '"/>';
                results += "</li>";
                $("#error-list").append(results);
                $("#error-" + errorCount).text(messages[i].extract);

                var errorDiv = ace.edit("error-" + errorCount);
                errorDiv.setReadOnly(true);
                errorDiv.getSession().setUseWrapMode(true);
                errorDiv.renderer.setShowGutter(false);
                errorDiv.setHighlightActiveLine(false);
                errorDiv.renderer.$cursorLayer.element.style.opacity = 0;
                errorDiv.setTheme("ace/theme/kuroir");
                errorDiv.getSession().setMode("ace/mode/xml");

                lineDifference = lastLine - firstLine;
                if (firstLine == 1) {
                    firstLine = firstLine - 1;
                } else {
                    firstLine = 1;
                }
                lastLine = firstLine + lineDifference;
                errorHighlightRange = new Range(firstLine, firstColumn - 1, lastLine, lastColumn);
                errorDiv.session.addMarker(errorHighlightRange, "ace_active-line", "text");

                var newHeight =
                    errorDiv.getSession().getScreenLength() * errorDiv.renderer.lineHeight + errorDiv.renderer.scrollBar.getWidth();

                $("#error-" + errorCount).height(newHeight.toString() + "px");
                errorDiv.resize();
            }
        }

        if (nonDocumentError !== "") {
            $("#alert").append('<div class="inserted alert alert-warning" role="alert">Validation failed: ' + nonDocumentError + '</div>');
        } else if (errorCount === 0) {
            $("#alert").append('<div class="inserted alert alert-success" role="alert">Good job! No errors found.</br><small>Interested in contributing your style or locale file? See our <a href="https://github.com/citation-style-language/styles/blob/master/CONTRIBUTING.md">instructions</a>.</small></div>');
        } else if (errorCount > 0) {
            if (errorCount == 1) {
                $("#alert").append('<div class="inserted alert alert-danger" role="alert">Oops, I found 1 error.</div>');
            } else {
                $("#alert").append('<div class="inserted alert alert-danger" role="alert">Oops, I found ' + errorCount + ' errors.</div>');
            }
            $("#alert > div.alert-danger").append('</br><small>If you have trouble understanding the error messages below, start by reading the <a href="http://citationstyles.org/downloads/specification.html">CSL specification</a>.</small>');

            $("#errors").attr("class", "panel panel-warning");
            $("#errors").prepend('<div class="panel-heading inserted"><h4 class="panel-title">Errors <a href="#" rel="tooltip" class="glyphicon glyphicon-question-sign" data-toggle="tooltip" data-placement="auto left" title="Click the link next to an error description to highlight the relevant lines in the Source window below"></a></h4></div>');
            $('[data-toggle="tooltip"]').tooltip();
        }

        if (data.source.code.length > 0) {
            $("#source").append('<div class="panel-heading inserted"><h4 class="panel-title">Source</h4></div>');
            $("#source").append('<div id="source-code" class="panel-body inserted"></div>');
            $("#source").attr("class", "panel panel-primary");
            $("#source-code").text(data.source.code);

            window.editor = ace.edit("source-code");
            editor.setReadOnly(true);
            editor.getSession().setUseWrapMode(true);
            editor.setHighlightActiveLine(true);
            editor.renderer.$cursorLayer.element.style.opacity = 0;
            editor.setTheme("ace/theme/eclipse");
            editor.getSession().setMode("ace/mode/xml");
        }

        validateButton.stop();
    }

    function moveToLine(firstLine, firstColumn, lastLine, lastColumn) {
        editor.scrollToLine(firstLine, true, true, function() {});
        editor.gotoLine(firstLine, 0, false);
        sourceHighlightRange = new Range(firstLine - 1, firstColumn - 1, lastLine - 1, lastColumn);
        editor.selection.setRange(sourceHighlightRange);
    }

    function removeValidationResults() {
        $(".inserted").remove();
        $("#errors").removeAttr("class");
        $("#source").removeAttr("class");
    }

    function reportTimeOut() {
        validateButton.stop();
        console.log("Call to http://validator.w3.org/nu/ timed out after " + responseMaxTime + "ms.");
        $("#alert").append('<div class="inserted alert alert-warning" role="alert">Validation is taking longer than expected! (more than ' + responseMaxTime/1000 + ' seconds)</div>');
        $("#alert > div.alert-warning").append('</br><small>This typically happens if the <a href="http://validator.w3.org/nu/">Nu HTML Checker</a> website is down, but maybe you get lucky if you wait a little longer.</small>');
    }

    return {
        init: init,
        moveToLine: moveToLine
    };
}());
