var CSLValidator = (function () {
    var adaptToSourceMethod = function (sourceMethod) {
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

    return {
        adaptToSourceMethod: adaptToSourceMethod
    };
}());
